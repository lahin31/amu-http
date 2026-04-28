import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/index';
import { requestId } from '@/middleware/requestId';

const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockReset());

const ok = () =>
  new Response(JSON.stringify({}), { headers: { 'content-type': 'application/json' } });

describe('requestId', () => {
  it('injects x-request-id by default with a generated value', async () => {
    fetchMock.mockImplementation(async () => ok());
    const api = createClient({ middleware: [requestId()] });
    await api.get('https://x/me');
    const id = (fetchMock.mock.calls[0]?.[1]?.headers as Headers).get('x-request-id');
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('uses a custom header name', async () => {
    fetchMock.mockImplementation(async () => ok());
    const api = createClient({ middleware: [requestId({ header: 'x-trace-id' })] });
    await api.get('https://x/me');
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('x-trace-id')).toBeTruthy();
    expect(headers.get('x-request-id')).toBeNull();
  });

  it('uses a custom generator', async () => {
    fetchMock.mockImplementation(async () => ok());
    let n = 0;
    const api = createClient({
      middleware: [requestId({ generator: () => `req-${++n}` })],
    });
    await api.get('https://x/a');
    await api.get('https://x/b');
    const id1 = (fetchMock.mock.calls[0]?.[1]?.headers as Headers).get('x-request-id');
    const id2 = (fetchMock.mock.calls[1]?.[1]?.headers as Headers).get('x-request-id');
    expect(id1).toBe('req-1');
    expect(id2).toBe('req-2');
  });

  it('preserves an existing x-request-id by default', async () => {
    fetchMock.mockImplementation(async () => ok());
    const api = createClient({ middleware: [requestId({ generator: () => 'NEW' })] });
    await api.get('https://x/me', { headers: { 'x-request-id': 'EXISTING' } });
    const id = (fetchMock.mock.calls[0]?.[1]?.headers as Headers).get('x-request-id');
    expect(id).toBe('EXISTING');
  });

  it('overwrites existing when preserveExisting=false', async () => {
    fetchMock.mockImplementation(async () => ok());
    const api = createClient({
      middleware: [requestId({ generator: () => 'NEW', preserveExisting: false })],
    });
    await api.get('https://x/me', { headers: { 'x-request-id': 'EXISTING' } });
    const id = (fetchMock.mock.calls[0]?.[1]?.headers as Headers).get('x-request-id');
    expect(id).toBe('NEW');
  });
});
