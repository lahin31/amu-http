/**
 * 07: Auth middleware with token rotation + refresh-on-401.
 *
 * `bearerAuth` resolves its token per request — rotation is observed
 * automatically. `refreshOn401` catches 401 responses, calls your `refresh`
 * function (deduped across concurrent requests), and retries.
 *
 * Run: npx tsx examples/07-middleware-auth.ts
 */
import { createClient } from 'amu-http';
import { bearerAuth, refreshOn401 } from 'amu-http/middleware/auth';
import { logger } from 'amu-http/middleware/logger';
import { requestId } from 'amu-http/middleware/requestId';

// Pretend auth store.
const authStore = {
  token: 'expired-token',
  async refresh() {
    await new Promise((r) => setTimeout(r, 50));
    this.token = `fresh-${Date.now()}`;
    console.log('  → token refreshed');
  },
};

const api = createClient({
  baseURL: 'https://api.example.com',
  middleware: [
    logger(), // outer-most: sees full request lifecycle
    requestId(),
    refreshOn401({ refresh: () => authStore.refresh() }),
    bearerAuth(() => authStore.token),
  ],
});

// In a real app, just call api.get / api.post. The middleware does the rest:
//   1. logger logs `→ GET ...`
//   2. requestId stamps `x-request-id`
//   3. refreshOn401 wraps the call
//   4. bearerAuth injects current token
//   5. (built-ins: retry, timeout, validate, parse, fetch)
//   6. On 401: refreshOn401 awaits authStore.refresh() and retries — the second
//      attempt re-runs bearerAuth and picks up the new token.

console.log('Configured client with auth middleware (token: ' + authStore.token + ').');
console.log(
  'On 401, refreshOn401 will call authStore.refresh() once even if 50 requests are in-flight.',
);
