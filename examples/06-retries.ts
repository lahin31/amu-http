/**
 * 06: Retries — safe defaults + advanced policy.
 *
 * Defaults retry only network errors and only on idempotent methods (GET, HEAD,
 * OPTIONS). The advanced form gives full control over attempts, delay, and
 * which HTTP statuses count as retryable.
 *
 * Run: npx tsx examples/06-retries.ts
 */
import { createClient } from 'amu-http';

const api = createClient({ baseURL: 'https://jsonplaceholder.typicode.com' });

// Demo: simulate one network failure, then succeed.
const originalFetch = globalThis.fetch;
let attempt = 0;
globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
  attempt++;
  if (attempt === 1) {
    console.log(`[attempt ${attempt}] simulated network failure`);
    throw new TypeError('fetch failed (synthetic)');
  }
  console.log(`[attempt ${attempt}] real fetch`);
  return originalFetch(...args);
};

// Simple shorthand: number of retry attempts.
const users = await api.get<Array<{ id: number }>>('/users', { retries: 2 });
console.log(`Recovered: ${users.length} users.`);
globalThis.fetch = originalFetch;

// Advanced: full retry config.
attempt = 0;
const data = await api.get<unknown>('/users', {
  retries: {
    attempts: 3,
    delay: (n) => 2 ** n * 50, // exponential: 100ms, 200ms, 400ms
    retryOn: ['network-error', 429, 500, 502, 503, 504],
    allowNonIdempotent: false, // POST/PUT/PATCH stay non-retryable
  },
});
console.log('Advanced policy succeeded.', Array.isArray(data) ? data.length : 'ok');
