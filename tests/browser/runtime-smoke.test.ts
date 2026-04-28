// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Amu } from '@/client/AmuClient';
import { AmuError } from '@/errors/AmuError';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

describe('browser-like runtime (happy-dom)', () => {
  it('uses globalThis.fetch and parses JSON via Response', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      }),
    );

    const amu = new Amu();
    const data = await amu.get<{ ok: boolean }>('https://api.example.com/ping');

    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves Headers / URL / AbortController APIs in browser-like env', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([1, 2, 3]), {
        headers: { 'content-type': 'application/json' },
      }),
    );

    const amu = new Amu();
    await amu.get('https://api.example.com/items', {
      params: { page: 1 },
      headers: { 'X-Trace': 'abc' },
    });

    const firstCall = fetchMock.mock.calls[0];
    if (!firstCall) throw new Error('expected fetch to be called');
    const [url, init] = firstCall;
    expect(url).toBe('https://api.example.com/items?page=1');
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
    expect((init as RequestInit).headers).toMatchObject({ 'X-Trace': 'abc' });
  });

  it('throws AmuError on non-2xx in browser-like env', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const amu = new Amu();
    await expect(amu.get('https://api.example.com/missing')).rejects.toBeInstanceOf(AmuError);
  });
});
