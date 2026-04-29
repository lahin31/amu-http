# ADR 0004 — User middleware composes outside built-ins

**Status:** Accepted (2026-04, after a real bug)

## Context

amu's middleware chain combines user-supplied middleware with the four built-in middleware (retry, timeout, validate, parse). The order matters.

During v2 development we initially composed user middleware *inside* built-ins:

```
[ retry → timeout → validate → parse → ...userMiddleware ] → terminal
```

This seemed reasonable: built-ins wrap the raw fetch, and user middleware sees the request "after" the built-in transforms.

The bug surfaced when we shipped `refreshOn401`. Test failure mode:

1. Request lands with status 401.
2. `parse` middleware (innermost, runs first on the way back) sees `response.ok === false` and **throws `AmuError`**.
3. The error propagates up. `validate`, `timeout`, `retry` all see it on their unwind path.
4. `refreshOn401` (in the user middleware list) was supposed to catch the `AmuError`, refresh the token, and retry. But since user middleware was *inside* `parse`, it never saw the error — `parse` threw it past them.

The same bug affected `logger` (couldn't log errors) and any user middleware doing post-error work.

## Decision

User middleware composes **outside** built-ins:

```
[ ...userMiddleware → retry → timeout → validate → parse ] → terminal
```

Recommended user-middleware order (outer → inner):

1. `logger` / metrics / OTel — outer-most, sees the full request lifecycle including retries
2. `requestId`
3. `refreshOn401` — catches `AmuError` thrown by `parse` on 401
4. `bearerAuth` — injects the latest token on each retry attempt
5. Custom user middleware

Built-ins always run between user middleware and the terminal fetch.

## Consequences

### Positive

- **`refreshOn401` works correctly.** It sees `AmuError` from `parse` and can retry.
- **Logger sees errors.** Outer-most logger captures everything including auth failures.
- **Telemetry sees the full lifecycle.** OTel spans wrap retries (single span per logical request); metrics counts request-shaped events not attempt-shaped.
- **Predictable mental model.** "User middleware wraps amu's built-in behavior" matches what users expect.

### Negative

- **`bearerAuth` re-runs on every retry attempt** (as it should). Slight overhead if token resolution is expensive. Mitigation: cache the token in your token getter.
- **Counter-intuitive at first glance.** "User code runs *outside* the framework's wrapping" sounds backwards until you realize the framework is unwrapping the response, not wrapping the user's intent.
- **Changing this order is a breaking change.** Locked in v2.0; revisiting requires a major.

## Alternatives considered

### Keep user middleware inside built-ins

Rejected. The bug is real; the fix is real. Working around it from user code (catching `AmuError` post-throw, manually wrapping built-ins) is worse than the right architecture.

### Multiple insertion points (`outerMiddleware`, `innerMiddleware`)

Considered. Allows user code to slot in anywhere. But: more API surface, more places to make ordering mistakes, more docs. The two-bucket model also doesn't address why a user would pick one bucket vs the other for a given middleware.

### Make `parse` and friends user-facing instead of automatic

Rejected. Most users want the throw-on-error contract by default. Forcing them to install `parse` themselves is a footgun (forget it once → silent broken response handling).

### Run middleware in a flat order with explicit `__order` and let the composer sort

Considered. The `__order` metadata exists on built-ins. Could extend to user middleware. But sort-on-construct adds engine complexity for a one-time benefit (users can already specify their own order in the array).

## Documentation

This ordering is documented in:

- README cookbook ("Middleware" section)
- CONTRIBUTING.md (architecture overview)
- `client.ts` JSDoc
- `defineMiddleware` JSDoc (mentions `__order` metadata for built-ins)

## See also

- [ADR 0005](./0005-next-may-be-called-multiple-times.md) — depends on this ordering for retry to work cleanly
- `src/client.ts` — composition order in `createClient`
- `src/middleware/auth.ts` — `refreshOn401` implementation that depends on this order
