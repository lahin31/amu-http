/**
 * amu vs ky / ofetch / redaxios / axios — same workload, deterministic in-process.
 *
 * All clients are wired to the same fake fetch (or axios adapter) so we measure
 * pipeline overhead, NOT network. Results are *only* meaningful within this
 * harness — real-world wall time is dominated by network RTT.
 *
 * Run: npm run bench
 */

import axios from 'axios';
import ky from 'ky';
import { ofetch } from 'ofetch';
import redaxios from 'redaxios';
import { bench, describe } from 'vitest';
import { z } from 'zod';
import { createClient } from '@/index';

const jsonBody = JSON.stringify({ id: 1, name: 'Ada', email: 'ada@example.com' });

// Shared fake fetch — every client (except axios, which has its own adapter) uses this.
const fakeFetch: typeof fetch = async () =>
  new Response(jsonBody, { status: 200, headers: { 'content-type': 'application/json' } });

// ─── Client setup ────────────────────────────────────────────────────────────

const amuClient = createClient({
  baseURL: 'https://api.example.com',
  fetch: fakeFetch,
});

const kyClient = ky.create({
  // ky 2.x: renamed from `prefixUrl`
  prefix: 'https://api.example.com',
  fetch: fakeFetch,
});

// ofetch + redaxios both read globalThis.fetch — set the global for this bench
// (acceptable since vitest bench runs each file in isolation; no cross-pollution).
const originalFetch = globalThis.fetch;
globalThis.fetch = fakeFetch;

const ofetchClient = ofetch.create({
  baseURL: 'https://api.example.com',
});

// axios uses adapters; the simplest deterministic adapter just synthesizes the response.
const axiosClient = axios.create({
  baseURL: 'https://api.example.com',
  adapter: async () => ({
    data: JSON.parse(jsonBody),
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    config: {} as never,
  }),
});

// ─── Benches ──────────────────────────────────────────────────────────────────

describe('GET — bare (no schema, no extras)', () => {
  bench('raw fetch + Response.json()', async () => {
    const r = await fakeFetch('https://api.example.com/users/1');
    await r.json();
  });

  bench('amu', async () => {
    await amuClient.get('/users/1');
  });

  bench('ky', async () => {
    await kyClient.get('users/1').json();
  });

  bench('ofetch', async () => {
    await ofetchClient('/users/1');
  });

  bench('redaxios', async () => {
    await redaxios.get('https://api.example.com/users/1');
  });

  bench('axios', async () => {
    await axiosClient.get('/users/1');
  });
});

describe('GET — with response validation', () => {
  const User = z.object({ id: z.number(), name: z.string(), email: z.string() });

  bench('amu + Zod schema', async () => {
    await amuClient.get('/users/1', { schema: { response: User } });
  });

  // ky / ofetch / redaxios / axios don't have built-in schema validation; for
  // parity, simulate the work users would do manually.
  bench('ky + manual Zod parse', async () => {
    const data = await kyClient.get('users/1').json();
    User.parse(data);
  });

  bench('ofetch + manual Zod parse', async () => {
    const data = await ofetchClient('/users/1');
    User.parse(data);
  });
});

describe('cleanup', () => {
  bench('restore globalThis.fetch', () => {
    globalThis.fetch = originalFetch;
  });
});
