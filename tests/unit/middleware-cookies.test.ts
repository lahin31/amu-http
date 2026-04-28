import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/index';
import { cookies, createCookieJar } from '@/middleware/cookies';

const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockReset());

const setCookie = (...values: string[]) => {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const v of values) headers.append('set-cookie', v);
  return new Response('{}', { headers });
};

describe('cookies middleware', () => {
  it('captures Set-Cookie and sends it back on the next request to the same origin', async () => {
    fetchMock
      .mockImplementationOnce(async () => setCookie('session=abc; Path=/'))
      .mockImplementationOnce(
        async () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
      );

    const jar = createCookieJar();
    const api = createClient({ middleware: [cookies({ jar })] });

    await api.post('https://api.example.com/login', { user: 'a' });
    await api.get('https://api.example.com/profile');

    const init = fetchMock.mock.calls[1]?.[1];
    expect((init?.headers as Headers).get('cookie')).toBe('session=abc');
    expect(jar.all()).toHaveLength(1);
    expect(jar.all()[0]).toMatchObject({ name: 'session', value: 'abc', path: '/' });
  });

  it('does NOT send cookies cross-domain', async () => {
    fetchMock
      .mockImplementationOnce(async () => setCookie('session=abc; Path=/'))
      .mockImplementationOnce(
        async () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
      );

    const jar = createCookieJar();
    const api = createClient({ middleware: [cookies({ jar })] });

    await api.get('https://api.example.com/login');
    await api.get('https://other.com/x');

    const init = fetchMock.mock.calls[1]?.[1];
    expect((init?.headers as Headers).get('cookie')).toBeNull();
  });

  it('respects the Domain attribute (cookie sent to subdomains)', async () => {
    fetchMock
      .mockImplementationOnce(async () => setCookie('id=42; Domain=example.com; Path=/'))
      .mockImplementationOnce(
        async () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
      );

    const api = createClient({ middleware: [cookies()] });

    await api.get('https://example.com/auth');
    await api.get('https://api.example.com/x');

    const init = fetchMock.mock.calls[1]?.[1];
    expect((init?.headers as Headers).get('cookie')).toBe('id=42');
  });

  it('respects the Path attribute (cookie scoped to subpath)', async () => {
    fetchMock
      .mockImplementationOnce(async () => setCookie('admin=1; Path=/admin'))
      .mockImplementationOnce(
        async () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
      )
      .mockImplementationOnce(
        async () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
      );

    const api = createClient({ middleware: [cookies()] });

    await api.get('https://x.test/admin');
    await api.get('https://x.test/admin/users'); // matches
    await api.get('https://x.test/public'); // no match

    expect((fetchMock.mock.calls[1]?.[1]?.headers as Headers).get('cookie')).toBe('admin=1');
    expect((fetchMock.mock.calls[2]?.[1]?.headers as Headers).get('cookie')).toBeNull();
  });

  it('Secure cookies are only sent over HTTPS', async () => {
    fetchMock
      .mockImplementationOnce(async () => setCookie('s=ok; Path=/; Secure'))
      .mockImplementationOnce(
        async () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
      )
      .mockImplementationOnce(
        async () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
      );

    const api = createClient({ middleware: [cookies()] });

    await api.get('https://x.test/login');
    await api.get('https://x.test/page'); // OK
    await api.get('http://x.test/page'); // dropped

    expect((fetchMock.mock.calls[1]?.[1]?.headers as Headers).get('cookie')).toBe('s=ok');
    expect((fetchMock.mock.calls[2]?.[1]?.headers as Headers).get('cookie')).toBeNull();
  });

  it('expired cookies are not sent', async () => {
    const past = new Date(Date.now() - 1000).toUTCString();
    fetchMock
      .mockImplementationOnce(async () => setCookie(`stale=x; Path=/; Expires=${past}`))
      .mockImplementationOnce(
        async () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
      );

    const jar = createCookieJar();
    const api = createClient({ middleware: [cookies({ jar })] });

    await api.get('https://x.test/login');
    await api.get('https://x.test/page');

    expect((fetchMock.mock.calls[1]?.[1]?.headers as Headers).get('cookie')).toBeNull();
    // Snapshot purges expired entries.
    expect(jar.all()).toHaveLength(0);
  });

  it('updates an existing cookie when the same name+domain+path is reset', async () => {
    fetchMock
      .mockImplementationOnce(async () => setCookie('session=v1; Path=/'))
      .mockImplementationOnce(async () => setCookie('session=v2; Path=/'))
      .mockImplementationOnce(
        async () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
      );

    const jar = createCookieJar();
    const api = createClient({ middleware: [cookies({ jar })] });

    await api.get('https://x.test/a');
    await api.get('https://x.test/b');
    await api.get('https://x.test/c');

    expect((fetchMock.mock.calls[2]?.[1]?.headers as Headers).get('cookie')).toBe('session=v2');
    expect(jar.all()).toHaveLength(1);
  });

  it('Max-Age overrides Expires (computed expiration)', async () => {
    fetchMock
      .mockImplementationOnce(async () => setCookie('a=1; Path=/; Max-Age=60'))
      .mockImplementationOnce(
        async () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
      );

    const jar = createCookieJar();
    const api = createClient({ middleware: [cookies({ jar })] });

    await api.get('https://x.test/login');
    await api.get('https://x.test/page');

    expect((fetchMock.mock.calls[1]?.[1]?.headers as Headers).get('cookie')).toBe('a=1');
    expect(jar.all()[0]?.expires).toBeInstanceOf(Date);
  });

  it('preserves caller-set Cookie header (merges)', async () => {
    fetchMock
      .mockImplementationOnce(async () => setCookie('jar=server; Path=/'))
      .mockImplementationOnce(
        async () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
      );

    const api = createClient({ middleware: [cookies()] });
    await api.get('https://x.test/login');
    await api.get('https://x.test/page', { headers: { cookie: 'manual=foo' } });

    const init = fetchMock.mock.calls[1]?.[1];
    expect((init?.headers as Headers).get('cookie')).toBe('manual=foo; jar=server');
  });

  it('jar.clear() empties the store', async () => {
    fetchMock.mockImplementationOnce(async () => setCookie('x=1; Path=/'));
    const jar = createCookieJar();
    const api = createClient({ middleware: [cookies({ jar })] });
    await api.get('https://x.test/login');
    expect(jar.all()).toHaveLength(1);
    jar.clear();
    expect(jar.all()).toHaveLength(0);
  });
});
