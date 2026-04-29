/**
 * Deno smoke test.
 *
 * Run from repo root after `npm ci && npm run build`:
 *   deno run --allow-net --allow-env --allow-read scripts/smoke-deno.ts
 *
 * Deno doesn't honor Node's package self-reference, so we import directly
 * from the built dist/.
 */

// @ts-expect-error — Deno-only global; not declared in the lib types we ship
const env = (Deno as { env: { get(key: string): string | undefined } }).env;

const url = env.get('SMOKE_URL') ?? 'https://jsonplaceholder.typicode.com/users/1';

const mod = await import('../dist/index.mjs');
const { amu, createClient, AmuError } = mod;

// 1. Default singleton + absolute URL
const data = await amu.get(url);
if (typeof data?.id !== 'number' || typeof data?.name !== 'string') {
  throw new Error(`Unexpected response shape: ${JSON.stringify(data)}`);
}

// 2. createClient with type-safe URL params
const api = createClient({ baseURL: 'https://jsonplaceholder.typicode.com' });
const second = await api.get('/users/:id', { params: { id: 2 } });
if (second.id !== 2) throw new Error(`Expected id=2, got ${second.id}`);

// 3. safe() Result API
const result = await api.safe.get('/this-route-does-not-exist-404');
if (result.ok) throw new Error('Expected 404');
if (result.error.name !== 'AmuError' || result.error.status !== 404) {
  throw new Error(`Expected AmuError(404), got ${result.error.name} ${result.error.status}`);
}

// 4. Throwing API
try {
  await api.get('/this-also-does-not-exist');
  throw new Error('Expected throw');
} catch (err) {
  if (!(err instanceof AmuError) || err.status !== 404) {
    throw new Error(`Unexpected throw: ${err}`);
  }
}

console.log('smoke (Deno): OK');
