# Changelog

All notable changes to amu-http. The 2.x line is managed by [Changesets](https://github.com/changesets/changesets); add a changeset (`npx changeset`) with every user-facing PR.

## 2.0.0-rc.0

Release candidate for v2.0. Locks the public API; pending real-user feedback before tagging stable.

### Changes since 2.0.0-alpha.0

- **`onAttempt` retry hook** — `RetryConfig.onAttempt(info)` fires before each retry with `{ attempt, error, delayMs }`. Async hooks awaited.
- **`paginate({ schema })`** — page-level Standard Schema validation; `getItems`/`getNext` receive the typed value. Throws `AmuValidationError` on invalid pages.
- **`amu-http/middleware/cache`** — RFC 9111-subset cache middleware (max-age / Expires / no-store / no-cache, ETag + Last-Modified revalidation, Vary support, custom keyFor for per-user scoping). Pluggable `CacheStore` interface; ships with `createMemoryCacheStore()`.
- **24-test classifier matrix** — every `AmuNetworkError.kind` exercised against undici / Bun / Deno / browser error shapes, with signal-based precedence and `isRetryable` flag asserted.
- **Competitor benchmark** — `bench/competitors.bench.ts` measures amu against ky / ofetch / redaxios / axios on the same in-process workload.
- **Migration guides** — `docs/migration-from-{axios,ky,ofetch}.md`.
- **Browser test environment** — `vitest.browser.config.ts` + `npm run test:browser` (Playwright Chromium). Opt-in CI via `.github/workflows/browser.yml`.
- **Real-network smoke workflow** — `.github/workflows/real-network.yml` (manual + weekly schedule).
- **TypeDoc API docs** — `npm run docs:api` generates HTML to `docs/api/`.

## 2.0.0 — _the v2 GA, scheduled after RC feedback_

### Breaking changes (v1 → v2)

amu v2 is a ground-up rewrite. The class-based v1 API, the `(url, body, config)` argument shapes, the `raw: true` option, and CJS support are all removed. There is no automated codemod; pin to `1.x` if you need v1 and migrate when convenient.

Headline differences:

- `new Amu(...)` → `createClient(...)` (no class in the public API)
- Per-request `<T>` annotation **and** `schema: { response: T }` both work — types follow the schema when present
- `params` (query) → split into `params` (URL `:id` substitutions) and `query` (`?key=value`)
- One error class hierarchy → **five** discriminated classes with exhaustive `switch` narrowing
- `safe()` Result API
- ESM-only, Node ≥ 20.3

### Added

**Core**
- `createClient(config)` returns a frozen `Client` of bound functions. No class.
- Default singleton `amu` for absolute-URL one-liners.
- Koa-style middleware pipeline as the only core abstraction. Built-in features (retry, timeout, validate, parse) implemented as middleware.
- Frozen `RequestContext` with `withHeader`, `withMeta`, `withSignal` helpers.

**Schema-inferred types — both directions**
- `schema.response` types the resolved value at compile time.
- `schema.body` types **and** validates outgoing payloads pre-send.
- Standard Schema v1 interop (Zod 3.24+, Valibot 0.31+, ArkType 2+); legacy `.parse` and pure validator functions also accepted.

**Type-safe URL parameters**
- `/users/:id/posts/:postId` extracts required `params` keys at compile time.
- Segment-walker parser handles absolute URLs and avoids the `https:` colon trap.
- Recursion-depth-capped at 24 segments.

**Errors — five discriminated classes**
- `AmuError` (HTTP non-2xx), `AmuNetworkError` (8 kinds: `dns | connect | tls | timeout-idle | timeout-active | abort | reset | unknown`), `AmuUrlError`, `AmuValidationError`, `AmuUnknownError`.
- `AmuAnyError` union for exhaustive narrowing.

**`safe()` Result API**
- `client.safe.{get,post,...}` returns `Result<T> = { ok: true; data } | { ok: false; error }`. Five-line wrapper.

**Streaming (tree-shakable)**
- `client.stream(path, options)` → `Promise<ReadableStream<Uint8Array>>`.
- `parseSSE` — spec-compliant Server-Sent Events parser (joins multi-line `data:`, normalizes CR/CRLF). No auto-reconnect by design.
- `parseNDJSON` — newline-delimited JSON with optional per-line schema validation and `onError: 'throw' | 'skip' | 'yield'`.
- Both cancel the upstream on `break` / `throw` from `for await` (verified by leak tests).
- Body serializer accepts `FormData`, `URLSearchParams`, `Blob`, `ReadableStream`, `ArrayBuffer`, strings; auto-falls-back to JSON.

**Built-in middleware library** (`amu-http/middleware/*` per-file imports)
- `bearerAuth(token)` — static or function token source, sync or async.
- `basicAuth(creds)` — UTF-8-safe base64.
- `refreshOn401({ refresh })` — concurrent-refresh dedupe.
- `requestId({ header?, generator?, preserveExisting? })` — `x-request-id` stamping.
- `logger({ log?, error?, level?, enabled? })` — dev request/response logger; redacts Authorization in verbose mode.
- `otel({ tracer?, spanName?, propagate? })` — OpenTelemetry spans + W3C traceparent injection. `@opentelemetry/api` is an optional peer dep.
- `cookies({ jar? })` + `createCookieJar()` — zero-dep RFC 6265 subset (Domain / Path / Expires / Max-Age / Secure / HttpOnly / SameSite).

**`amu-http/test`**
- `createMockClient()` returns a real `Client` plus a control surface for matching URL templates, recording requests, and asserting calls. Replaces `vi.stubGlobal('fetch', ...)`.

**`amu-http/forms`**
- `formData()` and `urlEncoded()` typed builders.

**`amu-http/pagination`**
- `paginate({ fetch, getItems, getNext })` async iterator over paged endpoints.
- `paginate.pages()` variant for page-level metadata.
- Presets: `cursor()`, `pageToken()`, plus `parseLinkHeader()` helper for RFC 5988.

**Configurable `querySerializer`**
- `'flat'` (default) — comma-joined arrays, the safe REST default.
- `'qs'` — bracketed nested syntax (`filter[date][gt]=2024-01-01`).
- Custom function for full control.

**`client.extend(overrides)`**
- Sub-clients with merged config + middleware. Headers merge, middleware appends (extension sits inside parent in the onion), other config overrides.

### Tooling and quality

- Zero runtime dependencies. Optional peer: `@opentelemetry/api`.
- ESM-only, target ES2022.
- Multi-entry build (`tsdown`) with shared chunks; per-file exports for tree-shaking.
- 199 tests across unit / browser-env smoke / Standard Schema interop / type-level. Coverage 94+ / 85+ / 98+ / 94+.
- size-limit: 5 budgets covering `core` (3.45 KB gzip), `+errors` (3.46 KB), `+SSE` (3.84 KB), `+SSE+NDJSON` (4.12 KB), `full barrel` (4.13 KB).
- `arethetypeswrong`: 9 entry points × 4 resolution modes — 36/36 green.
- Performance: amu's request pipeline runs at ~2.45x raw fetch on a deterministic in-process bench (typed wrapper + middleware overhead). Negligible vs network RTT.
- TypeScript matrix: 5.5 / 5.8 / 6.0.
- Runtime matrix: Node 20.3 / 20 / 22, Bun (latest), Deno 2.x.

---

## Pre-2.0 history

### 1.1.0 (2026-04-27)

- Add raw response mode for headers, status, and metadata
- Changelog feature included

### Earlier (1.0.x)

See git history.
