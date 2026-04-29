import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/index';
import { logger } from '@/middleware/logger';

const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockReset());

const ok = () =>
  new Response(JSON.stringify({}), { headers: { 'content-type': 'application/json' } });

describe('logger', () => {
  it('logs request → and response ←', async () => {
    fetchMock.mockImplementation(async () => ok());
    const log = vi.fn();
    const api = createClient({ middleware: [logger({ log })] });
    await api.get('https://x/users');
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0]?.[0]).toMatch(/^→ GET https:\/\/x\/users$/);
    expect(log.mock.calls[1]?.[0]).toMatch(/^← GET https:\/\/x\/users 200 \(\d/);
  });

  it('logs ✖ to error sink on failure', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    const log = vi.fn();
    const error = vi.fn();
    const api = createClient({ middleware: [logger({ log, error })] });
    await expect(api.get('https://x/oops')).rejects.toMatchObject({ status: 500 });
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toMatch(/^✖ GET https:\/\/x\/oops AmuError/);
  });

  it('skips when enabled() returns false', async () => {
    fetchMock.mockImplementation(async () => ok());
    const log = vi.fn();
    const api = createClient({
      middleware: [logger({ log, enabled: () => false })],
    });
    await api.get('https://x/silent');
    expect(log).not.toHaveBeenCalled();
  });

  it('redacts authorization in verbose mode', async () => {
    fetchMock.mockImplementation(async () => ok());
    const log = vi.fn();
    const api = createClient({
      headers: { authorization: 'Bearer secret' },
      middleware: [logger({ log, level: 'verbose' })],
    });
    await api.get('https://x/auth');
    const requestLine = log.mock.calls[0]?.[0] as string;
    expect(requestLine).toContain('authorization=<redacted>');
    expect(requestLine).not.toContain('Bearer secret');
  });
});
