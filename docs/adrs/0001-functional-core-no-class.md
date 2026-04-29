# ADR 0001 — Functional core, no class in public API

**Status:** Accepted (2026-04, with v2.0)
**Supersedes:** v1's `class Amu`

## Context

v1 of amu was class-based: `new Amu(config).get(...)`. Users typed `instanceof Amu` for guards, subclassed for variants, and found themselves carrying around `this` in unexpected places.

For v2 we asked whether a class is the right abstraction for an HTTP client at all. Three forces pushed against it:

1. **`this` makes composition hard.** Sub-clients (a child with extra middleware) want to *append* not subclass. With classes, "append" requires either inheritance (rigid) or composition-via-delegation (verbose).
2. **Class fields aren't tree-shakable.** Methods on a class prototype are pinned even if unused. We wanted users who only call `.get()` to pay nothing for `.put()` / `.patch()` / `.delete()`.
3. **TypeScript inference flows worse through classes.** Generic methods on a class with `this`-typed return values produce hard-to-read hover types compared to standalone generic functions.

## Decision

`createClient(config)` returns a frozen object literal of bound functions over closure state. No `class` in the public API. No `this`. No subclassing.

```ts
export interface Client {
  readonly get: BodylessMethod;
  readonly post: BodyMethod;
  // …
  readonly safe: { /* … */ };
}

export function createClient(config: ClientConfig): Client {
  // closure state lives here
  const fetcher = config.fetch ?? globalThis.fetch.bind(globalThis);
  const chain   = composeMiddleware(...);
  // …
  return Object.freeze({
    get: (path, opts) => execute({ method: 'GET', path, opts }),
    // …
  });
}
```

Sub-clients via `client.extend(overrides)` produce a new frozen Client; no subclassing.

State (cookie jar, cache store, circuit-breaker counters) lives in dedicated value-objects passed in via config, not on `this`.

## Consequences

### Positive

- **Tree-shaking works.** Users who only call `.get()` and never import the rest pay nothing for them at the bundle level.
- **No `this` traps.** No risk of `client.get` losing context when destructured (`const { get } = client; get(...)` Just Works).
- **Generic inference is cleaner.** Hover types are bounded by the function signature, not by the surrounding class.
- **Composition is explicit.** `client.extend(overrides)` is a transformation, not a subclassing protocol.
- **State is opt-in and visible.** A Client with no state is genuinely stateless. State only exists when you install state-holding middleware.

### Negative

- **`instanceof Amu` no longer works.** Users who relied on it for type guards must switch to checking `name` field on errors or duck-typing the Client interface. Documented as a v1→v2 breaking change.
- **No `super.method()` for plugin authors who would have subclassed.** Use middleware instead — `defineMiddleware` is the extension mechanism.
- **Slightly higher per-Client allocation.** Closure scope retains references that a class might have shared via prototype. Empirically negligible (~3KB per Client).

## Alternatives considered

### Keep the class

Rejected. The forces above accumulate: every feature added to a class makes future tree-shaking harder, every method makes inference more complex, every `this`-binding edge case is a footgun.

### Hybrid (class with optional functional facade)

Considered briefly. Adds API surface without meaningful benefit. Two ways to do the same thing splits docs, examples, and user mental models.

### Inheritance hierarchy (`class HttpClient`, `class JsonClient extends HttpClient`)

Rejected. Inheritance is the wrong tool for the variability we need. Different clients differ in *configuration* (headers, baseURL, middleware), not in *type*. Composition via `extend()` covers every realistic variant; subclassing covers no real cases that composition doesn't.

### Builder pattern (`amu().baseUrl(...).header(...).build()`)

Rejected. Adds a transient `Builder` type to the API surface without solving any actual problem. Plain object config is simpler.

## See also

- [ADR 0006](./0006-frozen-request-context.md) — extends the no-mutation principle to request contexts
- `src/client.ts` — implementation
