import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/index';
import { basicAuth, bearerAuth, refreshOn401 } from '@/middleware/auth';

const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockReset());

const ok = () =>
  new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json' },
  });

describe('bearerAuth', () => {
  it('injects Bearer header when token is a string', async () => {
    fetchMock.mockImplementation(async () => ok());
    const api = createClient({ middleware: [bearerAuth('static-token')] });
    await api.get('https://x/me');
    const init = fetchMock.mock.calls[0]?.[1];
    expect((init?.headers as Headers).get('authorization')).toBe('Bearer static-token');
  });

  it('calls function token source per request (rotation)', async () => {
    fetchMock.mockImplementation(async () => ok());
    let counter = 0;
    const api = createClient({ middleware: [bearerAuth(() => `tok-${++counter}`)] });
    await api.get('https://x/a');
    await api.get('https://x/b');
    const t1 = (fetchMock.mock.calls[0]?.[1]?.headers as Headers).get('authorization');
    const t2 = (fetchMock.mock.calls[1]?.[1]?.headers as Headers).get('authorization');
    expect(t1).toBe('Bearer tok-1');
    expect(t2).toBe('Bearer tok-2');
  });

  it('skips header when token resolves to null/undefined', async () => {
    fetchMock.mockImplementation(async () => ok());
    const api = createClient({ middleware: [bearerAuth(() => null)] });
    await api.get('https://x/me');
    const init = fetchMock.mock.calls[0]?.[1];
    expect((init?.headers as Headers).get('authorization')).toBeNull();
  });
});

describe('basicAuth', () => {
  it('encodes credentials as base64', async () => {
    fetchMock.mockImplementation(async () => ok());
    const api = createClient({
      middleware: [basicAuth({ username: 'aladdin', password: 'open sesame' })],
    });
    await api.get('https://x/me');
    const init = fetchMock.mock.calls[0]?.[1];
    const auth = (init?.headers as Headers).get('authorization');
    expect(auth).toBe('Basic YWxhZGRpbjpvcGVuIHNlc2FtZQ==');
  });

  it('handles non-ASCII credentials safely', async () => {
    fetchMock.mockImplementation(async () => ok());
    const api = createClient({
      middleware: [basicAuth({ username: 'üser', password: 'pässwörd' })],
    });
    await api.get('https://x/me');
    const init = fetchMock.mock.calls[0]?.[1];
    const auth = (init?.headers as Headers).get('authorization');
    expect(auth).toMatch(/^Basic /);
    // Decode and check round-trip
    const decoded = Buffer.from(auth!.slice('Basic '.length), 'base64').toString('utf-8');
    expect(decoded).toBe('üser:pässwörd');
  });
});

describe('refreshOn401', () => {
  it('refreshes on 401 and retries the original request', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(ok());
    let token = 'old';
    const refresh = vi.fn(async () => {
      token = 'new';
    });
    const api = createClient({
      middleware: [refreshOn401({ refresh }), bearerAuth(() => token)],
    });

    const data = await api.get('https://x/me');
    expect(data).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Second attempt used the new token
    const auth2 = (fetchMock.mock.calls[1]?.[1]?.headers as Headers).get('authorization');
    expect(auth2).toBe('Bearer new');
  });

  it('does not refresh when status is not 401', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    const refresh = vi.fn(async () => {});
    const api = createClient({
      middleware: [refreshOn401({ refresh }), bearerAuth('t')],
    });
    await expect(api.get('https://x/me')).rejects.toMatchObject({ status: 500 });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('dedupes concurrent refreshes (one refresh for many in-flight 401s)', async () => {
    // Set up: every first call gets 401, every second succeeds.
    let attempt = 0;
    fetchMock.mockImplementation(async () => {
      attempt++;
      // First 3 calls are the initial attempts (all fail 401), next 3 are retries (succeed).
      if (attempt <= 3) return new Response('{}', { status: 401 });
      return ok();
    });

    let refreshCount = 0;
    const refresh = vi.fn(async () => {
      refreshCount++;
      // Simulate work taking long enough that all 3 in-flight requests await it.
      await new Promise((r) => setTimeout(r, 10));
    });

    const api = createClient({
      middleware: [refreshOn401({ refresh }), bearerAuth('t')],
    });

    const results = await Promise.all([
      api.get('https://x/a'),
      api.get('https://x/b'),
      api.get('https://x/c'),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(6); // 3 × 401 + 3 × retry
  });

  it('honors custom shouldRefresh predicate', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{"err":"token_expired"}', { status: 419 }))
      .mockResolvedValueOnce(ok());
    const refresh = vi.fn(async () => {});
    const api = createClient({
      middleware: [
        refreshOn401({ refresh, shouldRefresh: (e) => e.status === 419 }),
        bearerAuth('t'),
      ],
    });
    const data = await api.get('https://x/me');
    expect(data).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledOnce();
  });
});
