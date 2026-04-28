// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AmuError, AmuValidationError, createClient } from '@/index';

const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => fetchMock.mockReset());

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init,
  });

describe('browser-like runtime (happy-dom)', () => {
  it('parses JSON via Response in browser env', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    const api = createClient();
    const data = await api.get('https://api.example.com/ping');
    expect(data).toEqual({ ok: true });
  });

  it('preserves Headers / URL / AbortSignal APIs', async () => {
    fetchMock.mockResolvedValue(json({ items: [] }));
    const api = createClient();
    await api.get('https://api.example.com/items', {
      query: { page: 1 },
      headers: { 'X-Trace': 'abc' },
    });
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error('expected fetch call');
    expect(call[0]).toBe('https://api.example.com/items?page=1');
    expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
    expect((call[1]?.headers as Headers).get('X-Trace')).toBe('abc');
  });

  it('throws AmuError on non-2xx in browser env', async () => {
    fetchMock.mockResolvedValue(json({ error: 'not_found' }, { status: 404 }));
    const api = createClient();
    await expect(api.get('https://api.example.com/missing')).rejects.toBeInstanceOf(AmuError);
  });

  it('runs schema validation against a Zod schema in the browser', async () => {
    fetchMock.mockResolvedValue(json({ id: 'wrong' }));
    const api = createClient();
    const User = z.object({ id: z.number() });
    await expect(
      api.get('https://api.example.com/u', { schema: { response: User } }),
    ).rejects.toBeInstanceOf(AmuValidationError);
  });
});
