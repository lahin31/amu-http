# ADR 0005 — `next()` may be called multiple times

**Status:** Accepted (2026-04, with v2.0)
**Diverges from:** Koa convention (where calling `next()` twice throws)

## Context

amu's middleware composer runs a Koa-style onion: each middleware receives `(ctx, next)`, calls `next(modifiedCtx)`, gets back a `ResponseContext`, optionally transforms it, and returns.

In Koa's reference implementation, the composer guards against `next()` being called multiple times by throwing `Error('next() called multiple times')`. This is a sensible footgun guard for typical web-server middleware — you almost never want to dispatch the inner stack twice.

But for an HTTP *client*, the most important built-in middleware (retry) needs exactly that:

```ts
async (ctx, next) => {
  try {
    return await next(ctx);          // attempt 1
  } catch (err) {
    if (shouldRetry(err)) {
      return await next(ctx);        // attempt 2 — needs to re-enter the chain
    }
    throw err;
  }
}
```

If we kept Koa's guard, retry would have to live outside the middleware chain (as a special case in the engine), or we'd need a parallel concept for "retry-able middleware" — both of which violate the principle that retry is just middleware (P3, P10).

## Decision

amu's composer **permits multiple `next()` calls**. Each call dispatches a fresh inner stack starting from the next middleware.

```ts
function dispatch(i: number, ctx: RequestContext): Promise<ResponseContext> {
  const fn = middleware[i];
  if (!fn) return terminal(ctx);
  const next = (ctx: RequestContext) => dispatch(i + 1, ctx);
  return fn(ctx, next);
}
```

No "called twice" check. Multiple calls are legal and intentional.

## Consequences

### Positive

- **Retry is just middleware.** No special-case engine logic. retry, hedging, single-flight, refresh-on-401 all use this freedom.
- **Minimal engine.** ~10 LOC composer. No state to track per-call.
- **Plugin authors can build retry-like patterns.** Custom retry policies (exponential backoff with jitter, retry budgets) plug in as middleware.

### Negative

- **No footgun guard.** A buggy user middleware that accidentally calls `next()` twice produces two real requests instead of an error. Mitigation: dev-mode warning when a non-retry middleware calls `next()` more than once (Phase C). Documentation calls this out.
- **State accumulation across calls.** Middleware that records timing or counts attempts per-call must scope state correctly. `timer middleware` between `retry` and the inner chain runs twice on retry — the documentation explicitly tells authors to put per-attempt timing INSIDE retry, lifecycle timing OUTSIDE.
- **Concurrency questions.** Two simultaneous `next()` calls (some middleware does parallel attempts — hedging) are legal. Plugin authors must understand this.

## Alternatives considered

### Keep Koa's once-only guard, special-case retry

Rejected. Special-casing retry in the engine couples the engine to a specific use case. Other patterns (hedging, single-flight retries on idempotent paths) would each need their own special case.

### Explicit "may call multiple times" capability flag

Considered. Mark middleware that legitimately re-enters with a flag; warn for unflagged middleware that calls `next()` twice. Adds API surface; the flag would always be opt-in for retry-like middleware. The runtime check pays a per-call cost. Decided the documentation route is cleaner.

### Separate `retry()` engine concept outside middleware

Rejected. retry as an engine concept means it can't compose with user middleware (e.g., logger sees individual attempts, not the retry envelope). Keeping it as middleware lets the user choose where it sits in the chain.

## Concurrency note

Two `next()` calls from a single middleware run *sequentially* (await one, then call the other) in the canonical retry case. Hedging middleware runs them *concurrently* (calls both, races them). Both are legal. The composer doesn't synchronize; each `next()` returns its own Promise.

## See also

- [ADR 0004](./0004-user-middleware-outside-builtins.md) — depends on this for retry's outer placement
- `src/request.ts` — `composeMiddleware` implementation
- `src/middleware/retry.ts` — uses this freedom
- `tests/unit/middleware-pipeline.test.ts` — "permits next() to be called multiple times" test
