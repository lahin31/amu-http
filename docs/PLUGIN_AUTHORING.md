# Plugin author guide

How to write a third-party amu middleware that's safe, correct, and composable. If you're shipping a package on npm, this is the contract you implement against.

For naming and quality bar (if you want your package to be considered for `@amu-http/*` recognition), see [QUALITY_BAR.md](./QUALITY_BAR.md).

---

## What is a plugin?

A plugin is a function that produces a `Middleware`. Users install it by passing it to `createClient({ middleware: [yourPlugin(opts)] })`.

```ts
import { defineMiddleware, type Middleware } from 'amu-http';

export function yourPlugin(opts: YourPluginOptions): Middleware {
  return defineMiddleware(
    'yourPlugin',
    async (ctx, next) => {
      // before request
      const res = await next(ctx);
      // after response
      return res;
    },
    'middle',  // optional: 'outer' | 'middle' | 'inner'
  );
}
```

That's the whole API. The rest of this guide is contracts you must honor and patterns that survive in production.

---

## Naming

| Pattern | Use when |
|---|---|
| `amu-http-<name>` (npm) | Community plugin, you are not affiliated with amu |
| `@<scope>/amu-http-<name>` | Your org's plugin |
| `@amu-http/<name>` | First-party — only with maintainer approval |

The npm package SHOULD have:
- Topic tag `amu-http-plugin` on GitHub
- README badge linking back to the [amu-http awesome list](https://github.com/lahin31/amu-http) (once it exists)
- Compatibility table showing which amu major versions you support

---

## The Middleware contract

Honor these or break user code.

### Contract 1 · Receive `ctx`, call `next(ctx)`, return what next returns

```ts
async (ctx, next) => {
  return await next(ctx);  // simplest possible middleware
}
```

If you want to skip the actual fetch (cache hit, mock, short-circuit), DON'T call `next` and synthesize a `ResponseContext`:

```ts
async (ctx, next) => {
  const cached = lookup(ctx.url);
  if (cached) {
    return {
      request: ctx,
      response: new Response(cached.body, { status: 200, headers: cached.headers }),
      data: cached.body,
      attempt: 1,
    };
  }
  return await next(ctx);
}
```

### Contract 2 · Don't mutate `ctx`

`RequestContext` is shape-frozen. Mutation will throw at runtime in dev, may silently fail in production. Use the helpers:

```ts
import { withHeader, withMeta, withSignal } from 'amu-http';

async (ctx, next) => {
  const headers = new Headers(ctx.headers);
  headers.set('Authorization', 'Bearer ...');
  // ❌ DON'T:  ctx.headers.set(...)            // throws
  // ❌ DON'T:  return next({ ...ctx, headers }) // works but skips clone
  // ✅ DO:
  return next(withHeader(ctx, 'Authorization', 'Bearer ...'));
}
```

For multiple headers or cross-field changes:

```ts
async (ctx, next) => {
  let nextCtx = ctx;
  nextCtx = withHeader(nextCtx, 'X-Trace', traceId);
  nextCtx = withHeader(nextCtx, 'X-Tenant', tenantId);
  return next(nextCtx);
}
```

### Contract 3 · Honor cancellation

`ctx.signal` is the universal cancellation channel. If your middleware does async work that should be cancellable:

```ts
async (ctx, next) => {
  if (ctx.signal.aborted) {
    throw ctx.signal.reason ?? new DOMException('aborted', 'AbortError');
  }
  // …or, if you create your own controller, compose:
  const inner = new AbortController();
  const combined = AbortSignal.any([ctx.signal, inner.signal]);
  // …
  return next(withSignal(ctx, combined));
}
```

If your middleware sleeps (rate limiter, retry delay), pass the signal to `setTimeout`-equivalents that abort.

### Contract 4 · `next()` may be called multiple times

Retry middleware re-invokes `next` for each attempt. Your middleware MUST be safe with multiple `next()` calls.

If you wrap `next()` and accumulate state, scope it correctly:

```ts
// ❌ accumulates across retries — wrong
async (ctx, next) => {
  const start = performance.now();
  const res = await next(ctx);
  const elapsed = performance.now() - start;
  return res;
}

// ✅ scoped per-call
async (ctx, next) => {
  return next(ctx);  // logger middleware does the timing OUTSIDE this; your concern is single-attempt
}
```

If you implement retry-like behavior yourself, document it and place yourself OUTER in the chain.

### Contract 5 · Clean up in `finally`

```ts
async (ctx, next) => {
  acquireResource();
  try {
    return await next(ctx);
  } finally {
    releaseResource();  // runs whether next throws or resolves
  }
}
```

The engine guarantees: if your `try` runs, your `finally` runs.

### Contract 6 · Don't retain `ctx` beyond the call

```ts
// ❌ leak — retains ctx after the call returns
let lastCtx;
async (ctx, next) => {
  lastCtx = ctx;
  return next(ctx);
}

// ✅ extract what you need
let lastUrl;
async (ctx, next) => {
  lastUrl = ctx.url;
  return next(ctx);
}
```

The engine doesn't pin contexts; they may be GC'd between awaits.

### Contract 7 · Throw amu errors, not raw `Error`

Throw one of the five `Amu*Error` classes, OR a plain Error that the engine will wrap as `AmuUnknownError`. Throwing custom error types confuses the `safe.*` Result narrowing.

```ts
import { AmuError, AmuValidationError } from 'amu-http';

async (ctx, next) => {
  const res = await next(ctx);
  if (res.response.headers.get('X-Account-Locked')) {
    throw new AmuError(403, 'Forbidden', { reason: 'account_locked' }, res.response.headers);
  }
  return res;
}
```

If you genuinely need a new error category, document it and tell users to handle it via `try/catch` instead of `safe.*`.

---

## Patterns

Reusable designs for common middleware shapes.

### Pattern 1 · Stateless transform

```ts
export function addHeader(name: string, value: string | (() => string)): Middleware {
  return defineMiddleware('addHeader', async (ctx, next) =>
    next(withHeader(ctx, name, typeof value === 'function' ? value() : value)),
  );
}
```

### Pattern 2 · Stateful (Closure-State)

State lives in a closure created by the factory; one closure per Client.

```ts
export function rateLimit(opts: { perSecond: number }): Middleware {
  const tokens = { value: opts.perSecond, lastRefill: Date.now() };

  const refill = () => {
    const now = Date.now();
    const dt = (now - tokens.lastRefill) / 1000;
    tokens.value = Math.min(opts.perSecond, tokens.value + dt * opts.perSecond);
    tokens.lastRefill = now;
  };

  const middleware = defineMiddleware('rateLimit', async (ctx, next) => {
    refill();
    if (tokens.value < 1) {
      const wait = ((1 - tokens.value) / opts.perSecond) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      refill();
    }
    tokens.value -= 1;
    return next(ctx);
  });

  // Optional dispose hook for cleanup
  return Object.assign(middleware, {
    dispose() {
      tokens.value = 0;
    },
  });
}
```

### Pattern 3 · Pluggable backend

If your middleware has a backend (cache, cookie jar, metrics sink), accept it as an interface so users can swap:

```ts
export interface RateLimitStore {
  acquire(key: string): Promise<number>;  // delay ms, 0 = ok
}

export function rateLimit(opts: { store: RateLimitStore; keyFor?: (ctx: RequestContext) => string }): Middleware {
  // …
}
```

Ship a default in-memory implementation. Users plug Redis, Upstash, etc.

### Pattern 4 · Cross-attempt coordination (deduplication)

If multiple in-flight requests should share a Promise:

```ts
export function singleFlight(): Middleware {
  const inflight = new Map<string, Promise<ResponseContext>>();

  return defineMiddleware('singleFlight', async (ctx, next) => {
    if (ctx.method !== 'GET') return next(ctx);
    const key = ctx.url;
    const existing = inflight.get(key);
    if (existing) return existing;

    const promise = next(ctx).finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }, 'middle');
}
```

This is exactly the pattern `refreshOn401` uses for refresh-dedup.

### Pattern 5 · Outer-most observer (logger / telemetry)

Sees the full request lifecycle including retries. Mark yourself `outer`:

```ts
export function metrics(): Middleware {
  return defineMiddleware('metrics', async (ctx, next) => {
    const start = performance.now();
    try {
      const res = await next(ctx);
      record(ctx.method, ctx.url, res.response.status, performance.now() - start);
      return res;
    } catch (err) {
      record(ctx.method, ctx.url, errorKind(err), performance.now() - start);
      throw err;
    }
  }, 'outer');
}
```

### Pattern 6 · Inner-most transform (parse / validate)

Sits closest to the wire. Mark `inner`:

```ts
export function decompressGzip(): Middleware {
  return defineMiddleware('decompressGzip', async (ctx, next) => {
    const res = await next(ctx);
    if (res.response.headers.get('content-encoding') === 'gzip') {
      // … (rare; usually fetch handles automatically)
    }
    return res;
  }, 'inner');
}
```

---

## Recommended ordering

Where does your plugin sit in the user's middleware list? Document this in your README.

| Position | Examples | Reasoning |
|---|---|---|
| Outer-most | logger, metrics, OTel, requestId | Observe the FULL request lifecycle including retries |
| Outer | refreshOn401, circuit breaker | Need to retry/abort after seeing the result of inner middleware |
| Middle | bearerAuth, csrf, custom headers | Need to be inside any retry so re-attempts pick up new tokens |
| Inner | decompression, custom parsers | Closest to the wire; deal in raw response |

If your plugin must run in a specific position, attach `__order` metadata via `defineMiddleware(name, fn, order)`. The composer warns in dev mode when ordering looks inverted.

---

## Configuration discipline

### Take a single options object

```ts
// ✅
yourPlugin({ a: 1, b: 2 })

// ❌ — positional args make refactors painful
yourPlugin(a, b)
```

### Accept getters for runtime values

For values that change over time (auth tokens, base URLs, feature flags):

```ts
yourPlugin({
  token: () => authStore.currentToken,   // resolved per-request
  // not: token: authStore.currentToken,  // captured at config time
});
```

### Default everything sensible

```ts
yourPlugin({});  // should work
yourPlugin();    // should also work for plugins with no required options
```

---

## Testing

### Unit-test against a mocked fetch

```ts
import { createClient } from 'amu-http';
import { yourPlugin } from './your-plugin';
import { vi } from 'vitest';

it('does the thing', async () => {
  const fetchMock = vi.fn(async () =>
    new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }),
  );
  const client = createClient({
    fetch: fetchMock,
    middleware: [yourPlugin({ /* … */ })],
  });

  await client.get('https://x/y');

  // Assert fetch was called with the headers your plugin added.
  expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ /* … */ });
});
```

Or use `createMockClient`:

```ts
import { createMockClient } from 'amu-http/test';

const mock = createMockClient({ middleware: [yourPlugin()] });
mock.on('GET', '/x', () => ({ body: { ok: true } }));
await mock.client.get('/x');
mock.assertCalled('GET', '/x');
```

### Type tests

If your plugin extends the type system (e.g., adds typed `meta` fields), include `*.test-d.ts`:

```ts
import { expectTypeOf } from 'vitest';
import type { RequestContext } from 'amu-http';
import { yourPlugin } from './your-plugin';

it('extends ctx.meta with traceId', () => {
  const mw = yourPlugin();
  // … type assertions against the augmented context shape
});
```

### Concurrency test

If your plugin holds state, test it under concurrent load:

```ts
it('handles 100 concurrent requests safely', async () => {
  const client = createClient({ fetch: fakeFetch, middleware: [yourPlugin()] });
  const results = await Promise.all(
    Array.from({ length: 100 }, (_, i) => client.get(`/x?n=${i}`)),
  );
  expect(results).toHaveLength(100);
  // Assert no state corruption.
});
```

### Cancellation test

Verify your plugin doesn't leak resources when the request is cancelled:

```ts
it('cleans up when cancelled', async () => {
  const controller = new AbortController();
  const promise = client.get('/x', { signal: controller.signal });
  controller.abort();
  await expect(promise).rejects.toMatchObject({ kind: 'abort' });
  // Assert your plugin's resources are released.
});
```

---

## Compatibility

Pin amu-http as a `peerDependency`, not a direct dependency:

```json
{
  "peerDependencies": {
    "amu-http": "^2.0.0"
  }
}
```

This avoids dual-instance bugs (where the user has one amu and your plugin has another).

If your plugin needs an external dep (Redis client, OpenTelemetry SDK), declare it as `peerDependencies` with `peerDependenciesMeta.optional: true` if your plugin has a default code path that doesn't require it.

---

## Documentation expectations

Your README should answer:

1. **What does it do?** — one-paragraph overview
2. **Install** — `npm install <name>`
3. **Quick example** — 5–10 lines that work
4. **Configuration** — every option with type and default
5. **Recommended placement** — where in the middleware chain?
6. **Performance characteristics** — does it allocate per request? Hold long-lived state? Make network calls?
7. **Compatibility** — which amu major versions are supported

Examples to model on: [`amu-http/middleware/auth`](../../src/middleware/auth.ts), [`amu-http/middleware/cookies`](../../src/middleware/cookies.ts).

---

## Anti-patterns

Things that work but break user code in subtle ways. Don't.

| Anti-pattern | Why it's bad |
|---|---|
| Mutating `ctx.headers` directly | Frozen; runtime error in dev. May silently corrupt other middleware's expectations in prod. |
| Storing `ctx` in module-level state | Memory leak; state pinned across unrelated requests. |
| Ignoring `ctx.signal` | User cancels; your plugin keeps running. Wastes CPU + leaks. |
| Throwing strings or plain objects | Breaks `safe.*` Result narrowing. Throw `Amu*Error` or `Error`. |
| Calling `next()` without awaiting | Returns a Promise of a Promise; consumers see wrong type. |
| Calling `next()` zero times AND not synthesizing a ResponseContext | Returns undefined; engine throws downstream. |
| Modifying `ctx.method` after the chain starts | Method is stamped early; some inner middleware may have already branched on it. |
| Reading `ctx.body` as if it's the original input | It's already serialized to BodyInit by the time middleware sees it. |
| Logging `ctx.headers` raw | Leaks `Authorization`. Use a redaction utility. |
| Side effects at module load (`top-level await fetch(...)`) | Breaks tree-shaking, ruins cold-start. |

---

## Submitting your plugin

1. Build it. Test it. Document it.
2. Tag your repo with `amu-http-plugin` topic.
3. Open a Discussion or PR adding it to the upcoming `awesome-amu-http` list.
4. If you want `@amu-http/*` consideration, follow the [QUALITY_BAR.md](./QUALITY_BAR.md) checklist.

You don't need maintainer permission to publish a third-party plugin. Just follow the contracts here and you'll fit cleanly into any user's amu setup.
