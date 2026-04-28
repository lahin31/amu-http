/**
 * Cross-runtime smoke test. Imports the built bundle and exercises the
 * happy path against a public test API. Run on Bun, Node, and Deno (via
 * the matching workflow) to verify multi-runtime compatibility.
 */
import amu, { Amu, AmuError } from '../dist/index.mjs';

const url = process.env.SMOKE_URL ?? 'https://jsonplaceholder.typicode.com/users/1';

async function main() {
  const data = await amu.get<{ id: number; name: string }>(url);
  if (typeof data.id !== 'number' || typeof data.name !== 'string') {
    throw new Error(`Unexpected response shape: ${JSON.stringify(data)}`);
  }

  const client = new Amu({ baseURL: 'https://jsonplaceholder.typicode.com' });
  const second = await client.get<{ id: number }>('/users/2');
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

  console.log('smoke: OK');
}

main().catch((err) => {
  console.error('smoke: FAIL', err);
  process.exit(1);
});
