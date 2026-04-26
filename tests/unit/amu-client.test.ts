import { afterEach, describe, expect, it, vi } from 'vitest';
import { Amu } from '../../src/client/AmuClient.js';
import { AmuError } from '../../src/errors/AmuError.js';
import { AmuNetworkError } from '../../src/errors/AmuNetworkError.js';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

describe('Amu client', () => {
  it('parses JSON response data when awaited', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ id: 1 }]), { headers: { 'content-type': 'application/json' } }));

    const amu = new Amu();
    const users = await amu.get<Array<{ id: number }>>('https://api.example.com/users');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(users).toEqual([{ id: 1 }]);
  });

  it('throws AmuError with parsed non-2xx response body', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    );

    const amu = new Amu();

    await expect(amu.get('https://api.example.com/missing')).rejects.toMatchObject({
      name: 'AmuError',
      status: 404,
      data: { message: 'not found' },
    });
  });

  it('reuses one underlying request for response readers', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }));

    const amu = new Amu();
    const req = amu.get<{ ok: boolean }>('https://api.example.com/status');

    const data = await req;
    const viaReader = await req.json<{ ok: boolean }>();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(data).toEqual({ ok: true });
    expect(viaReader).toEqual({ ok: true });
  });

  it('retries network errors for GET by default', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('temporary network issue'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }));

    const amu = new Amu();
    const result = await amu.get<{ ok: boolean }>('https://api.example.com/retry', { retries: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
  });

  it('does not retry POST unless allowNonIdempotent is enabled', async () => {
    fetchMock.mockRejectedValue(new Error('temporary network issue'));

    const amu = new Amu();

    await expect(
      amu.post('https://api.example.com/orders', { id: 1 }, { retries: { attempts: 2 } })
    ).rejects.toBeInstanceOf(AmuNetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries POST when allowNonIdempotent is explicitly enabled', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('temporary network issue'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ created: true }), { headers: { 'content-type': 'application/json' } }));

    const amu = new Amu();
    const result = await amu.post<{ created: boolean }>(
      'https://api.example.com/orders',
      { id: 1 },
      {
        retries: { attempts: 1, allowNonIdempotent: true },
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ created: true });
  });

  it('does not retry AbortError timeouts', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    fetchMock.mockRejectedValue(abortError);

    const amu = new Amu();

    await expect(amu.get('https://api.example.com/timeout', { retries: 2 })).rejects.toMatchObject({
      name: 'AmuNetworkError',
      kind: 'abort',
      isRetryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('wraps generic network failures as AmuNetworkError', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const amu = new Amu();

    await expect(amu.get('https://api.example.com/offline')).rejects.toMatchObject({
      name: 'AmuNetworkError',
      kind: 'network',
      isRetryable: true,
    });
  });

  it('retries configured status codes in retryOn', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'busy' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }));

    const amu = new Amu();
    const result = await amu.get<{ ok: boolean }>('https://api.example.com/retry-http', {
      retries: { attempts: 1, retryOn: [503] },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
  });

  it('keeps activeRequests in sync via loading callback', async () => {
    const states: boolean[] = [];
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }));

    const amu = new Amu({ onLoadingChange: (isLoading) => states.push(isLoading) });
    await amu.get('https://api.example.com/loading');

    expect(states).toEqual([true, false]);
  });

  it('throws AmuError class for non-2xx responses', async () => {
    fetchMock.mockResolvedValue(new Response('failed', { status: 500, headers: { 'content-type': 'text/plain' } }));

    const amu = new Amu();

    try {
      await amu.get('https://api.example.com/fail');
      throw new Error('Expected request to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AmuError);
    }
  });
});
