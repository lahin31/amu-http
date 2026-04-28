import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AmuError, AmuNetworkError, AmuValidationError, createClient } from '@/index';
import type { Middleware } from '@/types/middleware';

const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init,
  });

describe('createClient — happy paths', () => {
  it('GET resolves to parsed JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1, name: 'Ada' }));
    const api = createClient({ baseURL: 'https://api.example.com' });
    const data = await api.get('/users/1');
    expect(data).toEqual({ id: 1, name: 'Ada' });
  });

  it('POST sends JSON body and Content-Type', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const api = createClient({ baseURL: 'https://api.example.com' });
    await api.post('/users', { name: 'Ada' });

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBe('{"name":"Ada"}');
    expect(((init as RequestInit).headers as Headers).get('content-type')).toBe('application/json');
  });

  it('substitutes URL params', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1 }));
    const api = createClient({ baseURL: 'https://api.example.com' });
    await api.get('/users/:id/posts/:postId', { params: { id: 1, postId: 'a' } });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.com/users/1/posts/a');
  });

  it('appends query', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    const api = createClient({ baseURL: 'https://api.example.com' });
    await api.get('/users', { query: { page: 1, limit: 10 } });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.com/users?page=1&limit=10');
  });

  it('204 No Content returns null', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const api = createClient();
    const data = await api.delete('https://api.example.com/users/1');
    expect(data).toBeNull();
  });
});

describe('errors', () => {
  it('throws AmuError on non-2xx with parsed body', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ message: 'not found' }, { status: 404, statusText: 'Not Found' }),
    );
    const api = createClient();
    await expect(api.get('https://api.example.com/x')).rejects.toMatchObject({
      name: 'AmuError',
      status: 404,
      statusText: 'Not Found',
      data: { message: 'not found' },
    });
  });

  it('wraps generic fetch failures as AmuNetworkError', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const api = createClient();
    await expect(api.get('https://api.example.com/x')).rejects.toBeInstanceOf(AmuNetworkError);
  });
});

describe('schema validation', () => {
  const User = z.object({ id: z.number(), name: z.string() });

  it('infers and validates response with Zod (Standard Schema)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1, name: 'Ada' }));
    const api = createClient();
    const user = await api.get('https://api.example.com/u', { schema: { response: User } });
    expect(user).toEqual({ id: 1, name: 'Ada' });
  });

  it('throws AmuValidationError when response shape is wrong', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: '1', name: 'Ada' })); // id should be number
    const api = createClient();
    await expect(
      api.get('https://api.example.com/u', { schema: { response: User } }),
    ).rejects.toBeInstanceOf(AmuValidationError);
  });

  it('throws AmuValidationError on bad request body before sending', async () => {
    const api = createClient();
    await expect(
      // @ts-expect-error — deliberate wrong shape; runtime should catch it
      api.post('https://api.example.com/u', { id: 'wrong' }, { schema: { body: User } }),
    ).rejects.toMatchObject({
      name: 'AmuValidationError',
      target: 'request',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry validation failures', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ wrong: 'shape' }));
    const api = createClient();
    await expect(
      api.get('https://api.example.com/u', {
        schema: { response: User },
        retries: 3,
      }),
    ).rejects.toBeInstanceOf(AmuValidationError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('retry middleware (built-in)', () => {
  it('retries network errors for GET by default', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('temp'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const api = createClient();
    const data = await api.get('https://api.example.com/x', { retries: 1 });
    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry POST by default (idempotent-only)', async () => {
    fetchMock.mockRejectedValue(new TypeError('temp'));
    const api = createClient();
    await expect(
      api.post('https://api.example.com/x', { y: 1 }, { retries: { attempts: 3 } }),
    ).rejects.toBeInstanceOf(AmuNetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries POST when allowNonIdempotent', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('temp'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const api = createClient();
    const data = await api.post(
      'https://api.example.com/x',
      { y: 1 },
      { retries: { attempts: 1, allowNonIdempotent: true } },
    );
    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on configured HTTP statuses', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ msg: 'busy' }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const api = createClient();
    const data = await api.get('https://api.example.com/x', {
      retries: { attempts: 1, retryOn: [503] },
    });
    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry on non-retryable AmuError statuses', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ msg: 'forbidden' }, { status: 403 }));
    const api = createClient();
    await expect(api.get('https://api.example.com/x', { retries: 5 })).rejects.toBeInstanceOf(
      AmuError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('user middleware', () => {
  it('runs around the request and can mutate headers', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const auth: Middleware = async (ctx, next) => {
      const headers = new Headers(ctx.headers);
      headers.set('authorization', 'Bearer test');
      return next({ ...ctx, headers });
    };
    const api = createClient({ middleware: [auth] });
    await api.get('https://api.example.com/x');
    const [, init] = fetchMock.mock.calls[0]!;
    expect(((init as RequestInit).headers as Headers).get('authorization')).toBe('Bearer test');
  });
});

describe('safe() Result API', () => {
  it('wraps success as { ok: true, data }', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1 }));
    const api = createClient();
    const result = await api.safe.get('https://api.example.com/x');
    expect(result).toEqual({ ok: true, data: { id: 1 } });
  });

  it('wraps AmuError as { ok: false, error }', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { status: 500 }));
    const api = createClient();
    const result = await api.safe.get('https://api.example.com/x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.name).toBe('AmuError');
  });

  it('wraps unexpected throws as AmuUnknownError', async () => {
    const buggy: Middleware = async () => {
      throw new RangeError('oops');
    };
    const api = createClient({ middleware: [buggy] });
    const result = await api.safe.get('https://api.example.com/x');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.name).toBe('AmuUnknownError');
      expect(result.error.cause).toBeInstanceOf(RangeError);
    }
  });
});

describe('timeout middleware (built-in)', () => {
  it('aborts and throws timeout-active when slow', async () => {
    fetchMock.mockImplementation(async (_url, init?: RequestInit) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });
    const api = createClient({ timeout: 30 });
    await expect(api.get('https://api.example.com/slow')).rejects.toMatchObject({
      name: 'AmuNetworkError',
      kind: 'timeout-active',
    });
  });
});
