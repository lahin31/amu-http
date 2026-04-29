/**
 * Performance bench: amu's request pipeline overhead vs raw fetch.
 *
 * The `fetch` impl is replaced with a deterministic in-process function that
 * synthesizes a Response without network I/O. What we're measuring:
 *
 *   amu = (build context → run middleware chain → call fetch → parse body)
 *   raw =                                          (call fetch → parse body)
 *
 * Acceptance: amu p99 should be within ~10x of raw fetch p99 on the
 * same in-process fetch (we're paying for typed sugar, not network round-trips).
 *
 * NOTE: This is NOT a network benchmark. Real-world overhead is dwarfed by
 * the network RTT — this bench just verifies the wrapper isn't accidentally
 * quadratic or allocating excessively.
 */

import { bench, describe } from 'vitest';
import { z } from 'zod';
import { createClient } from '@/index';
import { bearerAuth } from '@/middleware/auth';
import { requestId } from '@/middleware/requestId';

// ─── Deterministic in-process fetch ───────────────────────────────────────────

const jsonBody = JSON.stringify({ id: 1, name: 'Ada', email: 'ada@example.com' });

const fakeFetch: typeof fetch = async () =>
  new Response(jsonBody, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

// ─── Clients ──────────────────────────────────────────────────────────────────

const apiBare = createClient({ fetch: fakeFetch });

const apiBaseUrl = createClient({
  baseURL: 'https://api.example.com',
  fetch: fakeFetch,
});

const apiTypical = createClient({
  baseURL: 'https://api.example.com',
  fetch: fakeFetch,
  middleware: [bearerAuth(() => 'tok'), requestId()],
});

const User = z.object({ id: z.number(), name: z.string(), email: z.string() });

// ─── Benches ──────────────────────────────────────────────────────────────────

describe('request pipeline overhead vs raw fetch', () => {
  bench('raw fetch + Response.json()', async () => {
    const res = await fakeFetch('https://api.example.com/users/1');
    await res.json();
  });

  bench('amu createClient + GET (no baseURL, no middleware)', async () => {
    await apiBare.get('https://api.example.com/users/1');
  });

  bench('amu createClient + GET (baseURL, no middleware)', async () => {
    await apiBaseUrl.get('/users/1');
  });

  bench('amu createClient + GET with :id params + 2 user middleware', async () => {
    await apiTypical.get('/users/:id', { params: { id: 1 } });
  });

  bench('amu createClient + GET + schema validation (Zod)', async () => {
    await apiBaseUrl.get('/users/1', { schema: { response: User } });
  });
});

describe('error path — non-2xx', () => {
  const errorBody = JSON.stringify({ error: 'not_found' });
  const errFetch: typeof fetch = async () =>
    new Response(errorBody, { status: 404, headers: { 'content-type': 'application/json' } });
  const errClient = createClient({ baseURL: 'https://api.example.com', fetch: errFetch });

  bench('AmuError throw + parsed body (404)', async () => {
    try {
      await errClient.get('/missing');
    } catch {
      /* expected */
    }
  });

  bench('safe.get() returning Result on 404', async () => {
    await errClient.safe.get('/missing');
  });
});

describe('safe() vs throw — happy path', () => {
  bench('throw path — get(url)', async () => {
    await apiBaseUrl.get('/users/1');
  });

  bench('safe path — safe.get(url)', async () => {
    await apiBaseUrl.safe.get('/users/1');
  });
});
