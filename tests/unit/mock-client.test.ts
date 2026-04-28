import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AmuError } from '@/index';
import { createMockClient } from '@/test/mock';

describe('createMockClient — basic matching', () => {
  it('returns the registered handler body as JSON', async () => {
    const mock = createMockClient({ baseURL: 'https://api.example.com' });
    mock.on('GET', '/users/:id', ({ params }) => ({ body: { id: Number(params.id) } }));

    const data = await mock.client.get('/users/:id', { params: { id: 42 } });
    expect(data).toEqual({ id: 42 });
  });

  it('matches by exact path when no params', async () => {
    const mock = createMockClient({ baseURL: 'https://api.example.com' });
    mock.on('GET', '/health', () => ({ body: { ok: true } }));

    const data = await mock.client.get('/health');
    expect(data).toEqual({ ok: true });
  });

  it('most-recently-registered handler wins', async () => {
    const mock = createMockClient({ baseURL: 'https://x.test' });
    mock.on('GET', '/u', () => ({ body: { who: 'first' } }));
    mock.on('GET', '/u', () => ({ body: { who: 'second' } }));

    const data = await mock.client.get('/u');
    expect(data).toEqual({ who: 'second' });
  });

  it('method `*` matches any HTTP method', async () => {
    const mock = createMockClient({ baseURL: 'https://x.test' });
    mock.on('*', '/echo', ({ method }) => ({ body: { method } }));

    expect(await mock.client.get('/echo')).toEqual({ method: 'GET' });
    expect(await mock.client.post('/echo', null)).toEqual({ method: 'POST' });
    expect(await mock.client.delete('/echo')).toEqual({ method: 'DELETE' });
  });

  it('returns 404 + AmuError when no route matches', async () => {
    const mock = createMockClient({ baseURL: 'https://x.test' });
    mock.on('GET', '/known', () => ({ body: 'ok' }));
    await expect(mock.client.get('/unknown')).rejects.toBeInstanceOf(AmuError);
  });
});

describe('reply() shorthand', () => {
  it('static body shorthand', async () => {
    const mock = createMockClient({ baseURL: 'https://x.test' });
    mock.reply('GET', '/u', { id: 1 });
    expect(await mock.client.get('/u')).toEqual({ id: 1 });
  });

  it('status + body shorthand throws AmuError', async () => {
    const mock = createMockClient({ baseURL: 'https://x.test' });
    mock.reply('GET', '/u', 500, { msg: 'boom' });
    await expect(mock.client.get('/u')).rejects.toMatchObject({
      name: 'AmuError',
      status: 500,
      data: { msg: 'boom' },
    });
  });
});

describe('request recording', () => {
  it('records method, url, query, params, headers, body', async () => {
    const mock = createMockClient({ baseURL: 'https://api.example.com' });
    mock.on('POST', '/users/:id/notes', () => ({ body: { ok: true } }));

    await mock.client.post(
      '/users/:id/notes',
      { text: 'hello' },
      {
        params: { id: 7 },
        query: { lang: 'en' },
        headers: { 'x-trace': 'abc' },
      },
    );

    const calls = mock.calls({ method: 'POST', path: '/users/:id/notes' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      pathname: '/users/7/notes',
      query: { lang: 'en' },
      params: { id: '7' },
      body: { text: 'hello' },
    });
    expect(calls[0]?.headers['x-trace']).toBe('abc');
  });

  it('decodes URL-encoded path segments back to original values', async () => {
    const mock = createMockClient({ baseURL: 'https://x.test' });
    mock.on('GET', '/search/:q', () => ({ body: 'ok' }));
    await mock.client.get('/search/:q', { params: { q: 'hello world' } });
    expect(mock.calls()[0]?.params).toEqual({ q: 'hello world' });
  });
});

describe('assertions', () => {
  it('assertCalled passes when matching call exists', async () => {
    const mock = createMockClient({ baseURL: 'https://x.test' });
    mock.on('GET', '/u', () => ({ body: 'ok' }));
    await mock.client.get('/u');
    expect(() => mock.assertCalled('GET', '/u')).not.toThrow();
  });

  it('assertCalled with count enforces exact times', async () => {
    const mock = createMockClient({ baseURL: 'https://x.test' });
    mock.on('GET', '/u', () => ({ body: 'ok' }));
    await mock.client.get('/u');
    await mock.client.get('/u');
    expect(() => mock.assertCalled('GET', '/u', 2)).not.toThrow();
    expect(() => mock.assertCalled('GET', '/u', 1)).toThrow(/2 time/);
  });

  it('assertCalled throws when no matching call', async () => {
    const mock = createMockClient({ baseURL: 'https://x.test' });
    expect(() => mock.assertCalled('GET', '/u')).toThrow(/no matching/);
  });

  it('assertNotCalled throws when matching call exists', async () => {
    const mock = createMockClient({ baseURL: 'https://x.test' });
    mock.on('GET', '/u', () => ({ body: 'ok' }));
    await mock.client.get('/u');
    expect(() => mock.assertNotCalled('GET', '/u')).toThrow(/was called/);
  });
});

describe('reset', () => {
  it('clears handlers and recorded calls', async () => {
    const mock = createMockClient({ baseURL: 'https://x.test' });
    mock.on('GET', '/u', () => ({ body: 'ok' }));
    await mock.client.get('/u');

    mock.reset();
    expect(mock.calls()).toEqual([]);
    await expect(mock.client.get('/u')).rejects.toBeInstanceOf(AmuError);
  });
});

describe('handler features', () => {
  it('handler can be async', async () => {
    const mock = createMockClient({ baseURL: 'https://x.test' });
    mock.on('GET', '/u', async () => {
      await Promise.resolve();
      return { body: { async: true } };
    });
    expect(await mock.client.get('/u')).toEqual({ async: true });
  });

  it('handler can read params and produce a dynamic response', async () => {
    const mock = createMockClient({ baseURL: 'https://x.test' });
    mock.on('GET', '/users/:id', ({ params }) => ({
      body: { id: params.id, doubled: Number(params.id) * 2 },
    }));
    const r = await mock.client.get('/users/:id', { params: { id: 21 } });
    expect(r).toEqual({ id: '21', doubled: 42 });
  });

  it('handler delay is observable', async () => {
    const mock = createMockClient({ baseURL: 'https://x.test' });
    mock.on('GET', '/slow', () => ({ delay: 30, body: { ok: true } }));
    const t0 = performance.now();
    await mock.client.get('/slow');
    expect(performance.now() - t0).toBeGreaterThanOrEqual(25);
  });
});

describe('integration with schema validation', () => {
  it('validates the mock-returned shape against a schema', async () => {
    const mock = createMockClient({ baseURL: 'https://x.test' });
    mock.on('GET', '/u/:id', () => ({ body: { id: 1, name: 'Ada' } }));

    const User = z.object({ id: z.number(), name: z.string() });
    const u = await mock.client.get('/u/:id', {
      params: { id: 1 },
      schema: { response: User },
    });
    expect(u).toEqual({ id: 1, name: 'Ada' });
  });
});
