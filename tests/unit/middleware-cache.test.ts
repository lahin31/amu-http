import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/index';
import { cache, createMemoryCacheStore } from '@/middleware/cache';

const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockReset());

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      ...((init.headers as Record<string, string>) ?? {}),
    },
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
  });

describe('cache middleware — fresh hits', () => {
  it('serves a fresh entry without going to the network on the second call', async () => {
    fetchMock.mockResolvedValue(
      json(
        { id: 1 },
        {
          headers: { 'cache-control': 'max-age=60' },
        },
      ),
    );

    const api = createClient({ middleware: [cache()] });
    const a = await api.get('https://x/u/1');
    const b = await api.get('https://x/u/1');
    expect(a).toEqual({ id: 1 });
    expect(b).toEqual({ id: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT serve a fresh entry across different URLs', async () => {
    fetchMock.mockImplementation(async (url) =>
      json({ url: String(url) }, { headers: { 'cache-control': 'max-age=60' } }),
    );

    const api = createClient({ middleware: [cache()] });
    await api.get('https://x/a');
    await api.get('https://x/b');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('cache middleware — revalidation', () => {
  it('sends If-None-Match when the entry has an ETag and is stale', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ id: 1 }, { headers: { etag: '"v1"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));

    const api = createClient({ middleware: [cache()] });
    await api.get('https://x/u/1');
    const second = await api.get('https://x/u/1');

    const init = fetchMock.mock.calls[1]?.[1];
    expect((init?.headers as Headers).get('if-none-match')).toBe('"v1"');
    expect(second).toEqual({ id: 1 }); // body served from cache after 304
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends If-Modified-Since when the entry has Last-Modified', async () => {
    const lastMod = new Date(2024, 0, 1).toUTCString();
    fetchMock
      .mockResolvedValueOnce(json({ id: 1 }, { headers: { 'last-modified': lastMod } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));

    const api = createClient({ middleware: [cache()] });
    await api.get('https://x/u/1');
    await api.get('https://x/u/1');

    const init = fetchMock.mock.calls[1]?.[1];
    expect((init?.headers as Headers).get('if-modified-since')).toBe(lastMod);
  });

  it('replaces the cached body on a fresh 200 (not 304)', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ v: 1 }, { headers: { etag: '"v1"' } }))
      .mockResolvedValueOnce(json({ v: 2 }, { headers: { etag: '"v2"' } }));

    const api = createClient({ middleware: [cache()] });
    expect(await api.get('https://x/u')).toEqual({ v: 1 });
    expect(await api.get('https://x/u')).toEqual({ v: 2 });
  });
});

describe('cache middleware — directives', () => {
  it('honors Cache-Control: no-store on the request (skips cache entirely)', async () => {
    fetchMock.mockImplementation(async () =>
      json({ ok: true }, { headers: { 'cache-control': 'max-age=60' } }),
    );

    const api = createClient({ middleware: [cache()] });
    await api.get('https://x/u');
    await api.get('https://x/u', { headers: { 'cache-control': 'no-store' } });
    await api.get('https://x/u');

    // 1st: cold; 2nd: skipped (no-store); 3rd: served from cache
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('honors Cache-Control: no-cache on the request (revalidates)', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({ v: 1 }, { headers: { etag: '"v1"', 'cache-control': 'max-age=999' } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }));

    const api = createClient({ middleware: [cache()] });
    await api.get('https://x/u');
    const r = await api.get('https://x/u', { headers: { 'cache-control': 'no-cache' } });

    expect(r).toEqual({ v: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2); // revalidation request was made
  });

  it('honors Cache-Control: no-store on the response (does not store)', async () => {
    fetchMock.mockImplementation(async () =>
      json({ ok: true }, { headers: { 'cache-control': 'no-store' } }),
    );

    const api = createClient({ middleware: [cache()] });
    await api.get('https://x/u');
    await api.get('https://x/u');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache binary responses', async () => {
    const blobResponse = () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'application/octet-stream', 'cache-control': 'max-age=60' },
      });
    fetchMock.mockImplementation(async () => blobResponse());

    const api = createClient({ middleware: [cache()] });
    await api.get('https://x/blob');
    await api.get('https://x/blob');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('cache middleware — methods', () => {
  it('only caches GET and HEAD by default', async () => {
    fetchMock.mockImplementation(async () =>
      json({ ok: true }, { headers: { 'cache-control': 'max-age=60' } }),
    );

    const api = createClient({ middleware: [cache()] });
    await api.post('https://x/u', { a: 1 });
    await api.post('https://x/u', { a: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('cache middleware — custom store', () => {
  it('uses an injected store and exposes it for inspection', async () => {
    fetchMock.mockResolvedValue(json({ id: 1 }, { headers: { 'cache-control': 'max-age=60' } }));
    const store = createMemoryCacheStore();
    const api = createClient({ middleware: [cache({ store })] });
    expect(store.size?.()).toBe(0);
    await api.get('https://x/u');
    expect(store.size?.()).toBe(1);
  });

  it('respects custom keyFor for per-user scoping', async () => {
    fetchMock.mockImplementation(async () =>
      json({ ok: true }, { headers: { 'cache-control': 'max-age=60' } }),
    );

    const store = createMemoryCacheStore();
    const api = createClient({
      middleware: [
        cache({
          store,
          keyFor: (method, url, headers) => `${method} ${url} u=${headers.get('x-user') ?? '_'}`,
        }),
      ],
    });

    await api.get('https://x/u', { headers: { 'x-user': 'alice' } });
    await api.get('https://x/u', { headers: { 'x-user': 'bob' } });
    await api.get('https://x/u', { headers: { 'x-user': 'alice' } });

    expect(fetchMock).toHaveBeenCalledTimes(2); // alice cold, bob cold, alice hit
    expect(store.size?.()).toBe(2);
  });
});
