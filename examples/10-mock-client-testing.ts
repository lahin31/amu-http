/**
 * 10: Testing with `createMockClient`.
 *
 * Replaces the brittle `vi.stubGlobal('fetch', ...)` pattern with a typed mock
 * that matches URL templates, records requests, and exposes assertions.
 * The returned `mock.client` is a real Client — schema validation, middleware,
 * retries all work exactly as in production.
 *
 * Run: npx tsx examples/10-mock-client-testing.ts
 */

import { createMockClient } from 'amu-http/test';
import { z } from 'zod';

const mock = createMockClient({ baseURL: 'https://api.example.com' });

// Static response shorthand.
mock.reply('GET', '/health', { ok: true });

// Dynamic handler with typed params, query, body, headers.
mock.on('GET', '/users/:id', ({ params }) => ({
  body: { id: Number(params.id), name: 'Ada' },
}));

// Error response.
mock.reply('POST', '/users', 422, { error: 'invalid' });

// Per-handler delay.
mock.on('GET', '/slow', () => ({ delay: 50, body: { ok: true } }));

const User = z.object({ id: z.number(), name: z.string() });

const user = await mock.client.get('/users/:id', {
  params: { id: 1 },
  schema: { response: User },
});
console.log('Got typed user:', user);

// Built-in assertions
mock.assertCalled('GET', '/users/:id', 1);
console.log('Recorded calls:', mock.calls().length);

// Reset between tests
mock.reset();
