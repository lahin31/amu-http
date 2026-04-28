import { describe, expect, it } from 'vitest';
import { createMockClient } from '@/test/mock';

describe('client respects querySerializer config', () => {
  it('uses qs nested serializer when configured', async () => {
    const mock = createMockClient({
      baseURL: 'https://api.example.com',
      querySerializer: 'qs',
    });
    mock.on('GET', '/users', () => ({ body: [] }));

    await mock.client.get('/users', {
      query: { filter: { status: 'active', date: { gt: '2024' } } },
    });

    const calls = mock.calls();
    expect(calls[0]?.url).toContain('filter%5Bstatus%5D=active');
    expect(calls[0]?.url).toContain('filter%5Bdate%5D%5Bgt%5D=2024');
  });

  it('uses a custom function serializer when configured', async () => {
    const mock = createMockClient({
      baseURL: 'https://api.example.com',
      querySerializer: (q) =>
        Object.entries(q)
          .map(([k, v]) => `${k}--${v}`)
          .join(','),
    });
    mock.on('GET', '/x', () => ({ body: 'ok' }));

    await mock.client.get('/x', { query: { a: 1, b: 2 } });
    expect(mock.calls()[0]?.url).toContain('?a--1,b--2');
  });

  it('flat is the default', async () => {
    const mock = createMockClient({ baseURL: 'https://api.example.com' });
    mock.on('GET', '/x', () => ({ body: 'ok' }));

    await mock.client.get('/x', { query: { ids: [1, 2, 3] } });
    expect(mock.calls()[0]?.url).toContain('ids=1%2C2%2C3');
  });
});
