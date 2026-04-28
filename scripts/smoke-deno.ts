/**
 * Deno smoke test. Imports the built bundle through Deno's npm specifier
 * resolver via the local dist/ artifact and exercises the happy path.
 */
// @ts-expect-error - Deno-only global
const env = (Deno as { env: { get(key: string): string | undefined } }).env;

const url = env.get('SMOKE_URL') ?? 'https://jsonplaceholder.typicode.com/users/1';

const mod = await import('../dist/index.mjs');
const amu = mod.default;
const { Amu, AmuError } = mod;

const data = await amu.get(url);
if (typeof data.id !== 'number' || typeof data.name !== 'string') {
  throw new Error(`Unexpected response shape: ${JSON.stringify(data)}`);
}

const client = new Amu({ baseURL: 'https://jsonplaceholder.typicode.com' });
const second = await client.get('/users/2');
if (second.id !== 2) {
  throw new Error(`Expected id=2, got ${second.id}`);
}

try {
  await amu.get('https://jsonplaceholder.typicode.com/this-route-does-not-exist-404');
  throw new Error('Expected 404 to throw');
} catch (err) {
  if (!(err instanceof AmuError) || err.status !== 404) {
    throw new Error(`Expected AmuError(404), got ${err}`);
  }
}

console.log('smoke (Deno): OK');
