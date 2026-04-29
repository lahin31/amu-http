# ADR 0006 — RequestContext is shape-frozen

**Status:** Accepted (2026-04, with v2.0)

## Context

The `RequestContext` flowing through the middleware chain is the data structure middleware reads and modifies. Two questions:

1. Is it mutable or immutable?
2. If immutable, how do middleware "modify" it?

A mutable context is the easy default. Middleware reaches in: `ctx.headers.set('X', 'Y')`, `ctx.url = newUrl`. Done. But this creates problems:

- **Spooky action at a distance.** Middleware A mutates the context; middleware B further down reads the mutated value. Reordering A and B silently changes behavior.
- **Concurrent re-entry.** When retry calls `next()` a second time (see [ADR 0005](./0005-next-may-be-called-multiple-times.md)), is it the same `ctx` or a fresh one? With mutation, accumulated changes from the first attempt leak into the second.
- **Plugin authors invent ad-hoc copy patterns.** Without a sanctioned way to derive a modified context, every middleware reinvents the wheel (some clone deep, some shallow, some not at all). Inconsistency.

## Decision

`RequestContext` is **shape-frozen** (`Object.freeze(ctx)` and `Object.freeze(ctx.meta)`). Middleware never mutates the context object. To "modify" the context they pass to `next`, they use sanctioned helpers:

- `withHeader(ctx, name, value)` — clones `Headers`, returns a new `RequestContext` with the new headers
- `withMeta(ctx, patch)` — merges patch into a new frozen `meta` object, returns a new context
- `withSignal(ctx, signal)` — returns a new context with a different `AbortSignal`

```ts
async (ctx, next) => {
  return next(withHeader(ctx, 'Authorization', `Bearer ${token}`));
}
```

The original `ctx` is never modified. The downstream middleware sees the new context; the caller still has the unmodified one.

## Consequences

### Positive

- **Composition is predictable.** Reordering middleware can never produce silent behavior changes from accumulated mutations.
- **Re-entry is safe.** Retry's second `next()` call passes the same original `ctx`; no leaked state from attempt 1.
- **Plugin authors have one obvious pattern.** Reach for `withHeader` / `withMeta` / `withSignal`; never do anything else.
- **Diffability.** Two `RequestContext` values can be compared for equality; mutation made that meaningless.
- **Cancels cleanly.** The original signal is preserved if a middleware adds a derived signal via `withSignal`; aborting either propagates.

### Negative

- **Slight allocation cost.** Each header change allocates a new `Headers` instance. Each meta change allocates a new frozen object. Empirically: ~2× allocation per middleware compared to mutating. Negligible at typical request rates (microseconds per request); measurable at 10K+ rps. Documented.
- **TypeScript type complexity.** `readonly` fields on `RequestContext`, `Readonly<>` on `meta`. Slightly more verbose internal types.
- **Headers are spec-mutable.** The `Headers` object itself is mutable per spec. We mitigate by NEVER returning the original Headers; helpers always clone. But: a plugin author who reaches into `ctx.headers.set('X', 'Y')` directly *can* mutate, and the freeze on the parent object doesn't catch it. Documented as an anti-pattern; lint rule planned for Phase F.

## Alternatives considered

### Mutable context

Rejected. The composition issues above outweigh the convenience.

### Deep-frozen context (recursively freeze headers, meta, body)

Considered. Spec compliance becomes the issue: `Headers` is a built-in mutable object; "deep-freezing" it would mean wrapping it in a `Proxy` that throws on `set`. Adds runtime cost on every request. Decided shape-frozen is the right balance — frozen at the level we own, mutable at the spec-defined level (`Headers`).

### Immutable.js or a structural-sharing library

Rejected. Adds a runtime dep for a problem solved adequately by `Object.freeze` + sanctioned helpers. amu has zero runtime deps; that's load-bearing.

### Reader monad / Effect-style

Rejected. Idiomatic functional pattern but heavy for users who haven't seen it. Plain object + helpers is the JS/TS-native equivalent.

## Implementation notes

- `Object.freeze(ctx)` and `Object.freeze(ctx.meta)` happen in `createContext` (`src/request.ts`).
- `withHeader` clones `new Headers(ctx.headers)` and freezes the new context shell.
- `withMeta` spreads into a new frozen object.
- `withSignal` swaps the signal field; preserves the rest.

In production code, freezing has near-zero runtime cost on V8 and JavaScriptCore. Bun is similar. The cost is in *cloning Headers per middleware* — but since middleware that doesn't write headers doesn't clone, this only pays when needed.

## See also

- [ADR 0001](./0001-functional-core-no-class.md) — extends the no-mutation philosophy to the Client itself
- [ADR 0005](./0005-next-may-be-called-multiple-times.md) — relies on context being safe to re-pass
- `src/request.ts` — `createContext`, `withHeader`, `withMeta`, `withSignal`
- `tests/unit/middleware-pipeline.test.ts` — "context immutability" test group
