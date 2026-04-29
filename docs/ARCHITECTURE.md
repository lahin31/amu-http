# amu-http architecture

The contract beneath the implementation. Read this if you're evaluating amu for production, authoring a plugin, or making changes that affect public surface.

For the human-facing API, see the [README](../README.md). For decisions and rationale, see [ADRs](./adrs/). For security posture, see [THREAT_MODEL](./THREAT_MODEL.md). For plugin development, see [PLUGIN_AUTHORING](./PLUGIN_AUTHORING.md).

---

## 1. North star

> **amu is a thin, composable, standards-native abstraction over `fetch`. It adds typed correctness, runtime safety, and pluggable extension — and adds nothing else.**

Everything that follows is the architectural commitment behind that sentence.

---

## 2. Core principles

Axioms. Anything that fights them, we don't ship.

| # | Principle |
|---|---|
| P1 | Standards-native, not framework-native — Web Platform APIs only, feature-detect APIs not runtimes |
| P2 | Functional core, no class — see [ADR 0001](./adrs/0001-functional-core-no-class.md) |
| P3 | One core abstraction: the middleware pipeline |
| P4 | Type inference flows from values |
| P5 | Errors are values (5 discriminated classes, exhaustive narrowing) |
| P6 | Frozen, immutable request contexts — see [ADR 0006](./adrs/0006-frozen-request-context.md) |
| P7 | Tree-shake-correct boundaries (`sideEffects: false`, per-file entry points) |
| P8 | Zero runtime deps in core |
| P9 | ESM-only — see [ADR 0002](./adrs/0002-esm-only.md) |
| P10 | Open at the boundaries (FetchImpl, Schema, CacheStore, CookieJar), closed at the center |
| P11 | Compose, don't subclass |
| P12 | Type safety is non-negotiable (zero `any`, four documented `as` boundaries) |

---

## 3. Module / layer architecture

Strict layering. Each layer depends only on layers below. No upward imports, no cycles. Enforced by `dependency-cruiser` in CI (see §10.4).

```
L8  Adjacent packages (separate npm)         @amu-http/openapi · /react · /graphql · ...
L7  Public surface                            amu-http  amu-http/middleware/*  /forms  /test  /pagination
L6  Optional middleware                       auth · requestId · logger · otel · cookies · cache · circuit · ...
L5  Client factory                            createClient · amu · safe · extend · dryRun · use
L4  Built-in middleware                       parse · parseOnError · validate · retry · timeout
L3  Request engine                            composeMiddleware · createTerminal · createContext · withHeader/Meta/Signal · classifyFetchFailure
L2  Pure helpers                              url · query · body · streaming/sse · streaming/ndjson
L1  Error classes                             AmuError · AmuNetworkError · AmuUrlError · AmuValidationError · AmuUnknownError
L0  Type primitives                           middleware · public · infer · result · standard-schema
```

A module at layer N may import from layers `0..N-1`. Never from N+1 or above.

---

## 4. Public surface

### Public is defined precisely

Public = exports reachable from any `package.json` `exports` entry. Internal = anything else.

Each `*.ts` export uses TSDoc tags:

```ts
/** @public */     export function createClient(...)
/** @internal */   export function _composeChain(...)
```

### Enforcement (mechanism, not just intent)

Three layers of enforcement so the boundary doesn't drift:

1. **Lint rule** — Biome custom rule (or ESLint plugin in Phase F) fails any `import` from `src/internal/**` inside a public-entry file.
2. **CI job** — `tsc --listFiles` output diffed between releases; new public files in `dist/` flagged unless ADR'd.
3. **Public-surface snapshot** — `scripts/snapshot-public-api.ts` writes `docs/public-surface.snapshot.txt` capturing every public export's name and type signature. PRs that change it must include a CHANGELOG entry.

### Versioning policy

- **Major** — breaking changes to public surface (L5–L7 + L8 packages)
- **Minor** — additive features
- **Patch** — bug fixes, no behavior change at fixed inputs

Internal exports (L0–L4) may change in any minor. Adjacent packages MUST NOT depend on internal exports — only on public ones.

### Deprecation policy

- Announced in CHANGELOG and via TSDoc `@deprecated` tag including the replacement.
- Behavior preserved for **at least one minor** before removal.
- Removal only on major.
- Removal candidates listed in `docs/deprecations.md`.

---

## 5. Lifecycle, state, and identity

The doc's most-important previously-undocumented section. **Real bugs hide here.**

### 5.1 · Client lifecycle

A `Client` is born when `createClient(config)` returns. It lives until:
- Garbage collected (default — no explicit cleanup needed for stateless usage)
- `client.dispose()` is called explicitly

`client.dispose()` exists for Clients with state that *must* be released:

| Stateful resource | Disposal action |
|---|---|
| Cookie jar (default) | clear the jar |
| Cache store | call `store.clear()` (in-memory) or close connection (Redis adapter) |
| Circuit breaker | freeze counters, fire `onClose` if open |
| Bulkhead semaphore | reject all queued requests with `AmuUnknownError('Client disposed')` |
| In-flight requests | abort via internal AbortController |

Calling `dispose()` is **idempotent**. Subsequent requests on a disposed Client throw `AmuUnknownError` synchronously.

In Node servers using long-lived Clients, prefer one global Client per backend; dispose on `SIGTERM`. In serverless, Clients per-invocation are fine — disposal happens implicitly via GC at the end of execution.

### 5.2 · Stateful middleware contract

Middleware that holds state (cache, cookies, circuit breaker, rate limit, refreshOn401's dedupe map) follows the **Closure-State pattern**:

```ts
function statefulMiddleware(opts: Opts) {
  const state = createState(opts);  // closure
  const dispose = () => releaseState(state);
  return Object.assign(
    defineMiddleware('name', async (ctx, next) => {
      // read/write `state`
    }),
    { dispose },                    // optional disposal hook
  );
}
```

`client.dispose()` walks the middleware list; for any middleware exposing a `dispose` function, it's invoked.

### 5.3 · State-sharing semantics

By default, `client.extend()` **shares state with the parent**. That means:

```ts
const parent = createClient({ middleware: [cookies()] });
const child  = parent.extend({});
// `parent` and `child` share the same cookie jar.
```

This is intentional: a sub-client for the same backend usually wants the same auth cookies, the same cache, the same circuit-breaker state. **It is also surprising**, so:

- Documented explicitly here (and in `extend()`'s TSDoc).
- Override by passing fresh middleware: `parent.extend({ middleware: [cookies({ jar: createCookieJar() })] })`.

### 5.4 · Sharing state across independent Clients

```ts
const jar = createCookieJar();
const cache = createMemoryCacheStore();

const usersClient = createClient({
  baseURL: 'https://api.example.com',
  middleware: [cookies({ jar }), cache({ store: cache })],
});

const adminClient = createClient({
  baseURL: 'https://admin.example.com',
  middleware: [cookies({ jar }), cache({ store: cache })],
});
// Both clients share auth cookies and cache hits.
```

Pluggable backends (Redis cookie jar, distributed cache) reuse the same interfaces.

### 5.5 · Time, randomness, and clock injection

- Cache TTLs, cookie expiry, retry delays use `Date.now()` by default.
- Request IDs and idempotency keys use `crypto.randomUUID()` by default.
- Both are injectable via Client config:

```ts
createClient({
  clock: () => myFakeClock.now(),
  random: () => myDeterministicRng.uuid(),
});
```

Tests pass fake clocks and seeded RNG without monkey-patching globals.

### 5.6 · Cold-start guarantee

`createClient()` performs **no I/O, no async work, no global registration, no scheduled timers**. Importing `amu-http` synchronously executes only type definitions and module-level `const`s.

This makes amu safe in serverless cold-start paths (Cloudflare Workers, Vercel Edge).

---

## 6. Concurrency contract

amu makes precise guarantees about concurrent and re-entrant execution. Plugin authors MUST honor these.

### 6.1 · Re-entrancy

The middleware chain is re-entrant. A single Middleware instance may be invoked from multiple in-flight requests simultaneously. Plugin authors MUST:

- **Treat the closure state as shared** — guard mutations with appropriate synchronization (Promise-chain mutex for serialization, atomic counters where applicable).
- **Not mutate `ctx`** — produce a new context via `withHeader`/`withMeta`/`withSignal` before passing to `next`.
- **Not retain references to ctx beyond the call** — the engine doesn't pin contexts; they may be GC'd between awaits.

### 6.2 · `next()` may be called multiple times

Unlike Koa, amu's composer permits multiple `next()` calls. Retry middleware relies on this. See [ADR 0005](./adrs/0005-next-may-be-called-multiple-times.md).

Each call to `next(ctx)` re-enters the inner chain with a fresh dispatch. Causally distinct calls produce distinct ResponseContext values.

### 6.3 · Cancellation propagation

`ctx.signal` is the universal cancellation channel. The chain honors it transparently:

- The terminal fetch passes `ctx.signal` to `globalThis.fetch`.
- Middleware that adds to the signal (timeout, hedging) uses `AbortSignal.any([...])` to compose.
- Downstream cancellation (consumer breaks out of a stream) calls `reader.cancel()` which propagates upstream.

Cancellation is **fast**: aborting a signal causes in-flight middleware to throw on the next await, unwinding cleanly.

### 6.4 · Backpressure

amu does not buffer streams. `client.stream()` returns the response's `ReadableStream` directly; consumer-side slowness propagates upstream via the spec's natural backpressure. There is no `highWaterMark` knob.

---

## 7. Failure semantics

What happens when middleware throws.

### 7.1 · Cleanup contract

Each middleware is responsible for its own cleanup:

```ts
const stamped = defineMiddleware('myStuff', async (ctx, next) => {
  acquireResource();
  try {
    return await next(ctx);  // may throw
  } finally {
    releaseResource();        // always runs
  }
});
```

The engine guarantees no further `next()` invocation after a throw at a given depth. Middleware that reached its `try` is guaranteed to reach its `finally`.

### 7.2 · Error normalization

The terminal step normalizes thrown values:

- `AmuError` / `AmuNetworkError` / `AmuUrlError` / `AmuValidationError` / `AmuUnknownError` — passed through.
- Anything else from middleware — wrapped in `AmuUnknownError` only at the `safe.*` boundary; throw-mode lets the original bubble.

### 7.3 · Partial execution after throw

If middleware A's `before` half ran and middleware B threw, A's `finally` runs. Other middleware *outside* A do not see a "before" half they didn't run. This matches JS Promise semantics; documented to make it explicit.

### 7.4 · Resource leaks under cancellation

When a request is cancelled mid-flight:

- **Streams**: the consumer-side iterator's `return()` MUST be called. amu's `parseSSE` / `parseNDJSON` propagate this via `try/finally`.
- **Connections**: undici's dispatcher pool reclaims the connection. amu doesn't pin any.
- **Middleware state**: each middleware's `finally` runs; cleanup happens locally.

CI runs leak tests on streaming primitives (Phase 2.1+).

---

## 8. Idempotency model

### 8.1 · Three categories of methods

- **Safe** — `GET`, `HEAD`, `OPTIONS`. May be retried freely. Cacheable.
- **Idempotent (not safe)** — `PUT`, `DELETE`. May be retried. Not cacheable by default.
- **Unsafe** — `POST`, `PATCH`. May NOT be retried by default. Effects on the server are not reversible.

The retry middleware reads this taxonomy. `allowNonIdempotent: true` opts into retrying unsafe methods, with an explicit warning in the docs.

### 8.2 · Idempotency-Key support (Phase A)

For payment-style APIs (Stripe, Square) where unsafe methods become *effectively idempotent* via a client-supplied key:

```ts
createClient({
  middleware: [idempotency({ generateKey: () => crypto.randomUUID() })],
});
```

The middleware:
1. Stamps `Idempotency-Key: <uuid>` on POST/PATCH/PUT requests.
2. Server-side dedup is the server's job; we just ship the header.
3. Retries reuse the SAME key (so the server can detect duplicates).

### 8.3 · Retry budgets (Phase A)

Bare retries amplify outages. amu supports a per-Client retry budget:

```ts
createClient({
  retries: { attempts: 3, budget: { ratio: 0.1, window: '60s' } },
});
// "No more than 10% of requests in the last 60 seconds may be retries."
```

When the budget is exceeded, retries are skipped (the original error propagates). This protects downstream services from cascade.

---

## 9. Threat model summary

The full document is in [THREAT_MODEL.md](./THREAT_MODEL.md). One-paragraph summary:

amu defends against **request smuggling** (CRLF injection in headers), **silent type drift** (response shapes change unnoticed), **token leaks in logs** (Authorization redaction), and **DoS via uncapped responses** (body size limits, Phase A). amu does NOT defend against compromised middleware, malicious peer dependencies (supply chain), XSS in user-controlled URLs displayed as HTML, or man-in-the-middle attacks (relies on TLS — bring your own pinning).

The trust boundary is the `FetchImpl` seam: anything passing through is amu's responsibility; anything wrapping amu (your code) is yours.

---

## 10. Quality enforcement (how the architecture stays correct)

### 10.1 · Type safety

- Zero `any` in `src/`. Biome `noExplicitAny: error`.
- `as` casts only at four documented boundaries: `Response.json()` typing, `error.cause` unwrap, frozen-context constructor, schema-infer helper.
- `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules` all on.
- TS matrix CI: 5.5 / 5.8 / 6.0 plus next-version prerelease nightly.

### 10.2 · Coverage

- Floors: 90/85/95/90 (lines/branches/functions/statements). Ratchets up; never lowers.
- `src/types/**` and `src/index.ts` excluded — pure type/re-export modules.

### 10.3 · Type-level tests

Every public generic has an `*.test-d.ts` assertion. PRs that add a public generic without a type test fail review.

### 10.4 · Module-graph integrity

`dependency-cruiser` runs in CI:
- No circular dependencies.
- No upward imports across layers (L3 → L4 forbidden).
- No internal-export imports from public-entry files.

### 10.5 · Public-surface snapshot

`scripts/snapshot-public-api.ts` writes `docs/public-surface.snapshot.txt`. CI fails if the snapshot diverges without an accompanying CHANGELOG entry.

### 10.6 · Bundle composition

`size-limit` enforces 5+ per-import-set budgets. Bundle-composition snapshot (`scripts/snapshot-bundle.ts`) lists every module included in `dist/index.mjs`. PRs that add modules to dist without a budget update fail.

### 10.7 · Performance gates

In-process benchmarks vs raw fetch + competitors. Regression beyond a tracked threshold fails the PR.

| Gate | Target |
|---|---|
| `createClient + GET` p99 | ≤ 3× raw fetch p99 |
| Cold-start (createClient) | < 1 ms |
| Memory per Client (no in-flight) | < 50 KB |
| Memory per in-flight request | < 10 KB excluding body |

---

## 11. Extension points (the contracts that make amu pluggable)

Five interfaces. Each is a small protocol; users implement them to plug behavior into amu without touching internals.

| # | Interface | Default | Pluggable to |
|---|---|---|---|
| 1 | `Middleware` | n/a | Anything that wraps a request |
| 2 | `FetchImpl` | `globalThis.fetch` | undici dispatcher, mocks, signing wrappers |
| 3 | `Schema<T>` | n/a | Zod, Valibot, ArkType, custom |
| 4 | `CacheStore` | `createMemoryCacheStore()` | Redis, Upstash, Cloudflare KV |
| 5 | `CookieJar` | in-memory RFC 6265 subset | tough-cookie, persistent stores |

Bonus extension points: `QuerySerializer`, `MetricsRecorder`, `Tracer`/`Propagator`, `RedactionPattern`, `Logger`, `Clock`, `Random`.

See [PLUGIN_AUTHORING.md](./PLUGIN_AUTHORING.md) for the contracts and patterns.

---

## 12. Standards & RFCs

### HTTP semantics

| Standard | What | Where |
|---|---|---|
| RFC 9110 | HTTP Semantics | retry middleware (idempotency rules) |
| RFC 9111 | HTTP Caching | cache middleware |
| RFC 9112 | HTTP/1.1 syntax | (delegated to runtime fetch) |
| RFC 7232 | Conditional Requests | cache middleware (revalidation) |
| RFC 7233 | Range Requests | streaming consumers |
| RFC 7807 | Problem Details for HTTP APIs | parse middleware (auto-detect) |
| RFC 6265bis | Cookies (current) | cookies middleware |
| RFC 8288 | Web Linking | pagination's `parseLinkHeader` |
| RFC 8941 | Structured Field Values | reserved for future header parsing |
| RFC 8246 | `immutable` Cache-Control | cache middleware |
| RFC 9211 | `Cache-Status` header | cache middleware (sets it) |

### Auth & signing

| Standard | What | Where |
|---|---|---|
| RFC 6750 | Bearer Token Usage | bearerAuth |
| RFC 7617 | Basic Authentication | basicAuth |
| RFC 6749 | OAuth 2.0 | refreshOn401 (token rotation pattern) |
| RFC 9421 | HTTP Message Signatures | sign-hmac middleware (RFC variant) |
| AWS SigV4 | AWS request signing | sign-aws middleware |

### Observability

| Standard | What | Where |
|---|---|---|
| W3C Trace Context | `traceparent` / `tracestate` | otel middleware |
| W3C Baggage | Distributed context propagation | otel middleware |
| OpenTelemetry HTTP semconv | Standard span attributes | otel middleware |

### Streaming

| Standard | What | Where |
|---|---|---|
| WHATWG SSE (HTML §9.2) | `text/event-stream` parsing | parseSSE |
| NDJSON | Line-delimited JSON | parseNDJSON |
| WHATWG Streams | `ReadableStream` / `WritableStream` | client.stream(), upload bodies |

### Validation interop

| Standard | What | Where |
|---|---|---|
| Standard Schema v1 | Cross-validator interop | inlined; every schema slot |

### Codegen / API description

| Standard | What | Where |
|---|---|---|
| OpenAPI 3.x / 3.1 | API spec → codegen | `@amu-http/openapi` |
| AsyncAPI 3.0 | SSE / WebSocket spec | reserved (future codegen) |

### Out of scope (explicitly delegated to the runtime)

HTTP/2 framing/HPACK, HTTP/3/QUIC, DNS resolution, TLS handshake, certificate chain validation, IDN/punycode, percent-encoding (URL Standard handles).

---

## 13. Architectural patterns (named, reusable)

Names for the patterns the codebase uses. Plugin authors copy these.

### Closure-State pattern
Stateful middleware (cache, cookies, circuit breaker, rate limit) closes over state created at factory time. Disposal hook on the middleware function (Object.assign) releases resources. See `src/middleware/cache.ts` for canonical implementation.

### Pluggable-Backend pattern
`CacheStore`, `CookieJar`, `MetricsRecorder` follow the same shape: small interface, default in-memory implementation, swap point for production. New backends adopt the existing default's tests as a contract suite.

### Sentinel-Cause pattern
`signal.abort('amu-timeout')` uses a string sentinel to disambiguate timeout-aborts from user-aborts in the classifier. Future timing primitives should reuse the same channel.

### Double-Validation pattern
Schemas validate **both directions**: request body before send (caught locally) and response data after receive. `target: 'request' | 'response'` discriminator on `AmuValidationError`.

### Order-Aware Onion pattern
Built-in middleware carries `__order: 'outer' | 'middle' | 'inner'` metadata. The composer warns in dev mode when ordering looks inverted. Users who write their own ordering-sensitive middleware should attach the same metadata via `defineMiddleware`.

---

## 14. Compatibility matrix

| Runtime | Minimum | Tested in CI |
|---|---|---|
| Node | 20.3 | 20.3 / 20-LTS / 22-LTS |
| Bun | latest stable | latest |
| Deno | 2.x | 2.x |
| Browsers | Chrome ≥ 90, Firefox ≥ 88, Safari ≥ 14, Edge ≥ 90 | Playwright Chromium |
| Cloudflare Workers | latest | manual smoke |
| Vercel Edge | latest | manual smoke |
| TypeScript | 5.5 | 5.5 / 5.8 / 6.0 + next nightly |
| Validators (optional) | Zod 3.24, Valibot 0.31, ArkType 2 | all three in contract tests |

### Cadence

- New runtimes added when significant adoption signal appears.
- Existing minimums bumped only on major releases.
- Browser support follows the [Baseline Widely Available](https://web.dev/baseline) line.
- TS minimum bumped after 18-month deprecation notice.

---

## 15. What we don't promise

Explicit non-guarantees. Adopt with this in mind.

- Bundle size won't shrink (might grow within budget; never silently exceed).
- Performance characteristics may shift between minors (within bench limits).
- Internal exports may change ANY release.
- Dev-only warning message format may change (only `error.name` and structured fields are stable).
- Error.message strings may change (only `error.name`, `kind`, `status`, `data`, `headers`, `target`, `issues` are stable).
- amu performs **no telemetry phone-home** — sends no diagnostic data, makes no network calls outside what your code asks for.

---

## 16. Compatibility & evolution

### Runtime version drift detection

A scheduled CI job checks for new Node minor releases monthly and opens a tracking issue. Bun and Deno checked similarly.

### TS version drift detection

CI matrix adds the latest TS stable on release. Nightly job tests against TS prerelease.

### RFC tracking

`docs/rfc-watch.md` lists relevant draft / WG specs we track for adoption (HTTP Cache Groups, Compression Dictionary Transport, TC39 stage-3 proposals affecting our contracts).

---

## 17. Governance

### Today (single maintainer)

- One maintainer makes architectural decisions.
- RFC-style proposals welcome (open as Discussion → promote to PR with `docs/rfcs/<n>-<title>.md`).
- All decisions captured as ADRs after the fact.

### After 3.0

- Two-maintainer model.
- Public RFC process for non-trivial changes (PR review period ≥ 7 days).
- Architectural changes require ADR.

### After meaningful adoption

- Steering committee (3–5 maintainers).
- Quarterly roadmap published.
- API review board for public-surface PRs.

### What's documented now (not aspirational)

The `docs/adrs/` directory and `docs/rfc-watch.md` are real artifacts maintained today.

---

## 18. Diagram — request lifecycle

```
client.get(url, options)
       │
       ▼
  build URL (params, query, baseURL)              (P10 boundary: querySerializer)
       │
       ▼
  validate request body (if schema.body)          (P4 inference, P5 errors-as-values)
       │
       ▼
  serialize body (JSON / FormData / stream / ...) (P1 universal types)
       │
       ▼
  createContext (frozen, with signal + meta)      (P6 immutability)
       │
       ▼
  composeMiddleware → run chain
       │  (outer: user middleware — logger / auth / refresh / telemetry)
       │  (inner: built-in — retry → timeout → validate → parse)
       ▼
  terminal fetch (calls fetchImpl)                (P10 boundary: FetchImpl)
       │
       ▼  Response
       │
       ▼ unwind back through chain
       │  (parse: read body)
       │  (validate: schema.response)
       │  (timeout: clear timer)
       │  (retry: catch retryable errors → re-enter)
       ▼
  Result<T> (safe.*) or T (throwing path)
```

Every box is at most ~30 LOC. Every arrow is a contract.

---

## See also

- [adrs/](./adrs/) — Architecture Decision Records (rationale for major decisions)
- [THREAT_MODEL.md](./THREAT_MODEL.md) — STRIDE-style threat model
- [PLUGIN_AUTHORING.md](./PLUGIN_AUTHORING.md) — guide for third-party plugin authors
- [QUALITY_BAR.md](./QUALITY_BAR.md) — quality bar for `@amu-http/*` adjacent packages
- [migration-from-axios.md](./migration-from-axios.md) / [-from-ky.md](./migration-from-ky.md) / [-from-ofetch.md](./migration-from-ofetch.md) — migration guides
