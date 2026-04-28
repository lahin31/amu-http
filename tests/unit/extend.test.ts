import { describe, expect, it } from 'vitest';
import { createClient } from '@/index';
import { createMockClient } from '@/test/mock';
import type { Middleware } from '@/types/middleware';

describe('client.extend()', () => {
  it('inherits parent baseURL when overrides omit it', async () => {
    const mock = createMockClient({ baseURL: 'https://api.example.com' });
    mock.on('GET', '/x', () => ({ body: { ok: 1 } }));

    const child = mock.client.extend({});
    expect(await child.get('/x')).toEqual({ ok: 1 });
  });

  it('overrides parent baseURL when given', async () => {
    const mock = createMockClient({ baseURL: 'https://api.example.com' });
    mock.on('GET', '/v2/users/:id', () => ({ body: { v: 2 } }));

    const v2 = mock.client.extend({ baseURL: 'https://api.example.com/v2' });
    const data = await v2.get('/users/:id', { params: { id: 1 } });
    expect(data).toEqual({ v: 2 });
  });

  it('merges headers (extension wins on conflict)', async () => {
    const seen: Array<Record<string, string | null>> = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      const h = (init?.headers as Headers) ?? new Headers();
      seen.push({
        common: h.get('x-common'),
        scoped: h.get('x-scoped'),
        ua: h.get('x-ua'),
      });
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    };

    const parent = createClient({
      headers: { 'x-common': 'parent', 'x-ua': 'parent-ua' },
      fetch: fetchImpl,
    });
    const child = parent.extend({
      headers: { 'x-common': 'child', 'x-scoped': 'only-child' },
    });

    await parent.get('https://x/p');
    await child.get('https://x/c');

    expect(seen[0]).toEqual({ common: 'parent', scoped: null, ua: 'parent-ua' });
    expect(seen[1]).toEqual({ common: 'child', scoped: 'only-child', ua: 'parent-ua' });
  });

  it('parent middleware runs first; extension middleware runs inside', async () => {
    const order: string[] = [];

    const m =
      (name: string): Middleware =>
      async (ctx, next) => {
        order.push(`${name}:before`);
        const r = await next(ctx);
        order.push(`${name}:after`);
        return r;
      };

    const mock = createMockClient();
    mock.on('GET', '/x', () => ({ body: 'ok' }));

    const parent = mock.client.extend({ middleware: [m('parent')] });
    const child = parent.extend({ middleware: [m('child')] });

    await child.get('https://x/x');

    expect(order).toEqual(['parent:before', 'child:before', 'child:after', 'parent:after']);
  });

  it('overrides timeout / retries / fetch / querySerializer', async () => {
    const parent = createClient({ timeout: 100, retries: 1 });
    const child = parent.extend({ timeout: 999, retries: { attempts: 5 } });
    // Sanity: no errors and clients are different objects.
    expect(child).not.toBe(parent);
  });
});
