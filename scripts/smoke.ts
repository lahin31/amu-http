/**
 * Cross-runtime smoke test (Node, Bun, Deno).
 *
 * Imports the built bundle through Node's package self-reference and exercises
 * the v2 surface: createClient, type-safe URL params, schema-aware parsing,
 * the safe() Result API, and middleware composition.
 *
 * Run from the repo root:
 *   npm run build && node scripts/smoke.ts
 *   bun run scripts/smoke.ts
 */
import { AmuError, createClient } from 'amu-http';
import { bearerAuth } from 'amu-http/middleware/auth';
import { requestId } from 'amu-http/middleware/requestId';

const url = process.env.SMOKE_URL ?? 'https://jsonplaceholder.typicode.com/users/1';

interface User {
  id: number;
  name: string;
}

async function main() {
  // 1. Default singleton (one-line absolute URL).
  const data = await fetchUserDefault();
  assertShape(data, 'default singleton');

  // 2. createClient with baseURL + middleware.
  const api = createClient({
    baseURL: 'https://jsonplaceholder.typicode.com',
    middleware: [requestId(), bearerAuth(() => 'demo-token')],
  });

  const user = await api.get<User>('/users/:id', { params: { id: 2 } });
  if (user.id !== 2) throw new Error(`Expected id=2, got ${user.id}`);

  // 3. safe() Result API on a 404.
  const result = await api.safe.get('/this-route-does-not-exist-404');
  if (result.ok) throw new Error('Expected 404, got success');
  if (result.error.name !== 'AmuError') {
    throw new Error(`Expected AmuError, got ${result.error.name}`);
  }
  if (result.error.status !== 404) {
    throw new Error(`Expected status=404, got ${result.error.status}`);
  }

  // 4. Throwing API still throws AmuError on 4xx.
  try {
    await api.get('/this-also-does-not-exist');
    throw new Error('Expected throw');
  } catch (err) {
    if (!(err instanceof AmuError) || err.status !== 404) {
      throw new Error(`Unexpected throw: ${err}`);
    }
  }

  console.log('smoke: OK');
}

async function fetchUserDefault(): Promise<unknown> {
  const { amu } = await import('amu-http');
  return amu.get(url);
}

function assertShape(data: unknown, where: string): void {
  if (typeof data !== 'object' || data === null || !('id' in data) || !('name' in data)) {
    throw new Error(`${where}: unexpected shape ${JSON.stringify(data)}`);
  }
}

main().catch((err) => {
  console.error('smoke: FAIL', err);
  process.exit(1);
});
