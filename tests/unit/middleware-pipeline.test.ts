import { describe, expect, it, vi } from 'vitest';
import { composeMiddleware, createContext, createTerminal, withHeader, withMeta } from '@/request';
import type { Middleware, RequestContext, ResponseContext } from '@/types/middleware';

const baseCtx = (): RequestContext =>
  createContext({
    url: 'https://api.example.com/x',
    method: 'GET',
    headers: new Headers(),
    body: null,
    signal: new AbortController().signal,
  });

const okResponseCtx = (ctx: RequestContext): ResponseContext => ({
  request: ctx,
  response: new Response(null, { status: 200 }),
  data: undefined,
  attempt: 1,
});

describe('composeMiddleware', () => {
  it('runs middleware in onion order: outer wraps inner', async () => {
    const order: string[] = [];

    const a: Middleware = async (ctx, next) => {
      order.push('a:before');
      const res = await next(ctx);
      order.push('a:after');
      return res;
    };
    const b: Middleware = async (ctx, next) => {
      order.push('b:before');
      const res = await next(ctx);
      order.push('b:after');
      return res;
    };

    const terminal = vi.fn(async (ctx: RequestContext) => okResponseCtx(ctx));
    const chain = composeMiddleware([a, b], terminal);
    await chain(baseCtx());

    expect(order).toEqual(['a:before', 'b:before', 'b:after', 'a:after']);
    expect(terminal).toHaveBeenCalledOnce();
  });

  it('permits next() to be called multiple times (retry pattern)', async () => {
    let calls = 0;
    const looping: Middleware = async (ctx, next) => {
      calls++;
      await next(ctx);
      calls++;
      return next(ctx);
    };
    const downstream = vi.fn(async (ctx: RequestContext) => okResponseCtx(ctx));
    const chain = composeMiddleware([looping], downstream);
    await chain(baseCtx());
    expect(calls).toBe(2);
    expect(downstream).toHaveBeenCalledTimes(2);
  });

  it('lets a middleware modify the ctx for downstream', async () => {
    const setHeader: Middleware = async (ctx, next) =>
      next(withHeader(ctx, 'authorization', 'Bearer xyz'));

    const captured = vi.fn(async (ctx: RequestContext) => okResponseCtx(ctx));
    const chain = composeMiddleware([setHeader], captured);
    await chain(baseCtx());

    expect(captured.mock.calls[0]?.[0].headers.get('authorization')).toBe('Bearer xyz');
  });

  it('lets a middleware short-circuit by not calling next', async () => {
    const cached: Middleware = async (ctx) => ({
      request: ctx,
      response: new Response('cached'),
      data: 'cached',
      attempt: 1,
    });

    const downstream = vi.fn(async (ctx: RequestContext) => okResponseCtx(ctx));
    const chain = composeMiddleware([cached], downstream);
    const result = await chain(baseCtx());

    expect(result.data).toBe('cached');
    expect(downstream).not.toHaveBeenCalled();
  });
});

describe('context immutability', () => {
  it('createContext freezes shape and meta', () => {
    const ctx = baseCtx();
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.isFrozen(ctx.meta)).toBe(true);
  });

  it('withHeader returns a new context with cloned headers', () => {
    const ctx = baseCtx();
    const next = withHeader(ctx, 'x-trace', 'abc');
    expect(next).not.toBe(ctx);
    expect(next.headers.get('x-trace')).toBe('abc');
    expect(ctx.headers.get('x-trace')).toBeNull();
  });

  it('withMeta merges into a new frozen meta object', () => {
    const ctx = withMeta(baseCtx(), { initial: 1 });
    const next = withMeta(ctx, { added: 'two' });
    expect(next.meta).toEqual({ initial: 1, added: 'two' });
    expect(ctx.meta).toEqual({ initial: 1 });
    expect(Object.isFrozen(next.meta)).toBe(true);
  });
});

describe('terminal fetch step', () => {
  it('calls fetch with ctx fields', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL, _init?: RequestInit) => new Response('ok', { status: 200 }),
    );
    const terminal = createTerminal(fetchImpl);
    const ctx = baseCtx();
    await terminal(ctx);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const call = fetchImpl.mock.calls[0];
    if (!call) throw new Error('expected call');
    expect(call[0]).toBe('https://api.example.com/x');
    expect(call[1]?.method).toBe('GET');
    expect(call[1]?.signal).toBe(ctx.signal);
  });

  it('classifies AbortError with timeout reason as timeout-active', async () => {
    const controller = new AbortController();
    controller.abort('amu-timeout');
    const ctx = createContext({
      url: 'https://api.example.com',
      method: 'GET',
      headers: new Headers(),
      body: null,
      signal: controller.signal,
    });
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    const terminal = createTerminal(fetchImpl);
    await expect(terminal(ctx)).rejects.toMatchObject({
      name: 'AmuNetworkError',
      kind: 'timeout-active',
    });
  });

  it('classifies user-aborted requests as abort', async () => {
    const controller = new AbortController();
    controller.abort();
    const ctx = createContext({
      url: 'https://api.example.com',
      method: 'GET',
      headers: new Headers(),
      body: null,
      signal: controller.signal,
    });
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    const terminal = createTerminal(fetchImpl);
    await expect(terminal(ctx)).rejects.toMatchObject({
      name: 'AmuNetworkError',
      kind: 'abort',
    });
  });

  it('classifies cause.code === ENOTFOUND as dns', async () => {
    const fetchImpl = async () => {
      const err = new TypeError('fetch failed');
      (err as Error & { cause?: unknown }).cause = { code: 'ENOTFOUND' };
      throw err;
    };
    const terminal = createTerminal(fetchImpl);
    await expect(terminal(baseCtx())).rejects.toMatchObject({
      name: 'AmuNetworkError',
      kind: 'dns',
    });
  });

  it('classifies cause.code === ECONNREFUSED as connect', async () => {
    const fetchImpl = async () => {
      const err = new TypeError('fetch failed');
      (err as Error & { cause?: unknown }).cause = { code: 'ECONNREFUSED' };
      throw err;
    };
    const terminal = createTerminal(fetchImpl);
    await expect(terminal(baseCtx())).rejects.toMatchObject({
      name: 'AmuNetworkError',
      kind: 'connect',
    });
  });

  it('classifies cause.code === ECONNRESET as reset', async () => {
    const fetchImpl = async () => {
      const err = new TypeError('fetch failed');
      (err as Error & { cause?: unknown }).cause = { code: 'ECONNRESET' };
      throw err;
    };
    const terminal = createTerminal(fetchImpl);
    await expect(terminal(baseCtx())).rejects.toMatchObject({
      name: 'AmuNetworkError',
      kind: 'reset',
    });
  });

  it('classifies undici headers timeout as timeout-idle', async () => {
    const fetchImpl = async () => {
      const err = new TypeError('fetch failed');
      (err as Error & { cause?: unknown }).cause = { code: 'UND_ERR_HEADERS_TIMEOUT' };
      throw err;
    };
    const terminal = createTerminal(fetchImpl);
    await expect(terminal(baseCtx())).rejects.toMatchObject({
      name: 'AmuNetworkError',
      kind: 'timeout-idle',
    });
  });

  it('classifies TLS failures as tls (non-retryable)', async () => {
    const fetchImpl = async () => {
      const err = new TypeError('fetch failed');
      (err as Error & { cause?: unknown }).cause = { code: 'ERR_TLS_CERT_ALTNAME_INVALID' };
      throw err;
    };
    const terminal = createTerminal(fetchImpl);
    await expect(terminal(baseCtx())).rejects.toMatchObject({
      name: 'AmuNetworkError',
      kind: 'tls',
      isRetryable: false,
    });
  });
});
