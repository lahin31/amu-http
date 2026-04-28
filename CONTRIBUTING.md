# Contributing to amu-http

Thanks for your interest. This document covers everything needed to develop, test, and ship the package.

For security issues, see [SECURITY.md](SECURITY.md) — **do not** file public issues for vulnerabilities.

---

## Prerequisites

- **Node.js** ≥ 20.3 (we use native `AbortSignal.any`)
- **npm** ≥ 9

The package targets Node 20+, modern browsers, edge runtimes (Cloudflare Workers, Vercel Edge), Deno, and Bun. Code must use only APIs available across all of these — `fetch`, `AbortController`, `URLSearchParams`, `setTimeout`, `Headers`, `Response`, `ReadableStream`, `crypto.randomUUID`.

---

## Setup

```bash
git clone https://github.com/lahin31/amu-http.git
cd amu-http
npm ci
```

`npm ci` runs the `prepare` script, which registers a pre-commit git hook via `simple-git-hooks`. Every `git commit` runs `lint-staged` → `biome check --write` on staged files. To bypass once: `SKIP_SIMPLE_GIT_HOOKS=1 git commit ...`.

---

## Architecture

amu has **one** core abstraction: the **middleware pipeline**. Built-in features (retry, timeout, schema validation, body parsing) are themselves middleware. User middleware composes through the same chain.

```
                 [ user middleware ]   ← runs outer-most
                          │
                          ▼
            [ retry → timeout → validate → parse ]   ← built-ins
                          │
                          ▼
                    [ terminal fetch ]   ← actual network call
```

User middleware sits *outside* built-ins so:
- `logger` / telemetry sees the full request lifecycle (incl. retries)
- `refreshOn401` catches `AmuError` thrown by `parse` on 401
- `bearerAuth` injects the latest token on each retry attempt

### `RequestContext` is shape-frozen

Middleware never mutates the context — they pass a new one to `next()` via `withHeader` / `withMeta` / `withSignal`. Headers are cloned on write. This costs ~2x allocation per middleware (negligible for the use case) but makes middleware composition reasoning much simpler.

### Type-safety contract

- **Zero `any`** in `src/`. Biome enforces.
- **Zero `as` casts** outside four documented boundaries (Response.json typing, error.cause unwrapping, frozen-context constructor, schema-infer helper).
- **`noUncheckedIndexedAccess`** + **`verbatimModuleSyntax`** + **`isolatedModules`** all on.
- Public generics propagate from values (schemas, URL templates) — never from the call site. `client.get('/u/:id', { params: { id: 1 }, schema: { response: User } })` types the result as `z.infer<typeof User>` with no `<T>` annotation.
- Each public generic has a corresponding `*.test-d.ts` assertion.

---

## Project layout

```
src/
  index.ts             # public re-exports
  client.ts            # createClient + the default `amu` singleton + safe wrapper
  request.ts           # pure middleware runner + terminal + context helpers
  url.ts               # URL building (interpolate / resolve / appendQuery)
  query.ts             # flat / qs serializers (extensible via custom function)
  body.ts              # body serialization (FormData, ReadableStream, JSON, ...)
  errors/              # 5 error classes
    AmuError.ts
    AmuNetworkError.ts
    AmuUrlError.ts
    AmuValidationError.ts
    AmuUnknownError.ts
  middleware/          # built-in + library middleware (each file = potential entry point)
    parse.ts           #  internal — body parser for JSON chain
    parseOnError.ts    #  internal — error-only parser for streaming chain
    retry.ts           #  internal
    timeout.ts         #  internal
    validate.ts        #  internal — also exposes `validateSchema()`
    auth.ts            #  PUBLIC — bearerAuth / basicAuth / refreshOn401
    requestId.ts       #  PUBLIC — X-Request-ID stamping
    logger.ts          #  PUBLIC — dev request/response logger
  streaming/           # tree-shakable protocol parsers
    sse.ts             #  parseSSE
    ndjson.ts          #  parseNDJSON
  forms/               # PUBLIC — typed FormData + URLSearchParams builders
  test/
    mock.ts            # PUBLIC — createMockClient() under amu-http/test
  types/
    standard-schema.ts #  inlined Standard Schema v1 spec (zero-dep)
    middleware.ts      #  Middleware, RequestContext, ResponseContext, defineMiddleware
    public.ts          #  Client, ClientConfig, RequestOptions, BodylessMethod, ...
    infer.ts           #  InferSchema, InferUrlParams (segment walker)
    result.ts          #  Result<T>, AmuAnyError union
tests/
  unit/                #  node-env unit tests
  browser/             #  happy-dom-env smoke tests
  types/               #  *.test-d.ts (expectTypeOf assertions)
  contract/            #  Standard Schema interop matrix (Zod sync/async, transforms, refines)
  leaks/               #  reserved for stream-cancellation leak tests
bench/                 #  vitest bench microbenchmarks
.changeset/            #  version intents (one file per change)
.github/
  workflows/           #  ci, publish, codeql, runtime-smoke
  ISSUE_TEMPLATE/      #  bug.yml, feature.yml, config.yml
  PULL_REQUEST_TEMPLATE.md
  dependabot.yml
```

Path alias `@/*` → `src/*` is set in `tsconfig.json` and mirrored in `vitest.config.ts`. tsdown reads it directly. The alias is build-time only — published `dist/` has zero alias references.

### Public entry points (per-file exports for tree-shaking)

| Entry | Source | Purpose |
|---|---|---|
| `amu-http` | `src/index.ts` | Core: `createClient`, `amu`, errors, types, `parseSSE`, `parseNDJSON` |
| `amu-http/middleware/auth` | `src/middleware/auth.ts` | `bearerAuth`, `basicAuth`, `refreshOn401` |
| `amu-http/middleware/requestId` | `src/middleware/requestId.ts` | `requestId` |
| `amu-http/middleware/logger` | `src/middleware/logger.ts` | `logger` |
| `amu-http/test` | `src/test/mock.ts` | `createMockClient` |
| `amu-http/forms` | `src/forms/index.ts` | `formData`, `urlEncoded` |

Each becomes its own file in `dist/` plus shared chunks (`request-*.mjs`, etc.) — bundlers resolve correctly via the `exports` map.

---

## Tooling

| Tool | Purpose | Config |
|---|---|---|
| **tsdown** (rolldown) | Multi-entry build, minification, `.d.ts` emit, ESM-only | [`tsdown.config.ts`](tsdown.config.ts) |
| **TypeScript** | Type-check only (no emit) | [`tsconfig.json`](tsconfig.json) |
| **Biome 2** | Lint + format (replaces ESLint + Prettier) | [`biome.json`](biome.json) |
| **Vitest 3** | Unit + browser-env + type-level + coverage + bench | [`vitest.config.ts`](vitest.config.ts) |
| **happy-dom** | Browser-like environment for `tests/browser/` | per-file `// @vitest-environment happy-dom` |
| **size-limit** | Per-import-set bundle gates | `size-limit` block in `package.json` |
| **publint** | `package.json` exports + files validation | — |
| **arethetypeswrong** | Type resolution across `node10`, `node16-CJS/ESM`, `bundler` | `--ignore-rules cjs-resolves-to-esm no-resolution` (we are ESM-only) |
| **simple-git-hooks** + **lint-staged** | Pre-commit lint/format on staged files | `package.json` |
| **tsx** | Run TypeScript example files directly | — |
| **Changesets** | Versioning + changelog + npm publish | [`.changeset/config.json`](.changeset/config.json) |
| **Dependabot** | Weekly grouped dep PRs | [`.github/dependabot.yml`](.github/dependabot.yml) |
| **CodeQL** | SAST | [`.github/workflows/codeql.yml`](.github/workflows/codeql.yml) |
| **JSR** | Optional dual publish to jsr.io | [`jsr.json`](jsr.json) |

Build: ESM-only, target ES2022, no source maps in published artifacts (the package does not ship `src/`, so maps are dead weight).

---

## Scripts

```bash
# Quality gates
npm run lint           # biome check
npm run lint:fix       # biome check --write
npm run format         # biome format --write
npm run typecheck      # tsc --noEmit

# Tests
npm test               # vitest — unit + browser + type tests
npm run test:watch     # vitest watch
npm run test:coverage  # v8 coverage with enforced thresholds
npm run test:types     # vitest --typecheck.only

# Bench
npm run bench          # vitest bench --run

# Build
npm run build          # tsdown — emits dist/
npm run dev            # tsdown --watch
npm run clean          # rm -rf dist

# Validation
npm run verify         # publint + attw --pack
npm run size           # size-limit (5 budgets covering core + per-feature import sets)
```

`npm run prepublishOnly` chains `lint → typecheck → build → verify → size` and runs automatically before `npm publish`.

### Test categories

| Folder | Environment | What |
|---|---|---|
| `tests/unit/` | `node` | Unit tests — most are mock-fetch-based |
| `tests/browser/` | `happy-dom` | Smoke tests verifying browser-like globals work |
| `tests/types/*.test-d.ts` | (typecheck only) | `expectTypeOf` assertions on the public API |
| `tests/contract/standard-schema.test.ts` | `node` | Zod / Valibot / ArkType interop matrix |
| `bench/*.bench.ts` | `node` | Microbenchmarks (manual `npm run bench`) |

---

## Bundle-size discipline

`size-limit` enforces multiple gates:

| Import set | Limit | Realistic |
|---|---|---|
| `{ createClient }` | 3.5 KB | 3.45 KB |
| `{ createClient, AmuError, ... }` (all errors) | 3.5 KB | 3.46 KB |
| `{ createClient, parseSSE }` | 3.9 KB | 3.84 KB |
| `{ createClient, parseSSE, parseNDJSON }` | 4.2 KB | 4.12 KB |
| Full barrel | 4.2 KB | 4.13 KB |

If a PR pushes any bundle over budget, CI fails. Update the limit only when the growth is intentional and discussed in the PR description. Tree-shake-friendliness is non-negotiable: `client.sse` and `client.ndjson` were considered for the API but rejected because they prevent tree-shaking the parsers.

### Coverage thresholds

`vitest run --coverage` fails if coverage drops below **90 / 85 / 95 / 90** (lines / branches / functions / statements). Current state is well above floor (95+ / 86+ / 97+ / 95+). Raise thresholds with every PR that improves coverage; **never lower** without explicit justification.

`src/types/**` and `src/index.ts` (re-export module) are excluded from coverage — no runtime behaviour to cover.

### Type-level tests

Files matching `tests/**/*.test-d.ts` use Vitest's `expectTypeOf`. They run as a separate `typecheck` suite. **Add a type test for any new exported type, generic, or change to a method's return type** — these are the contract with consumers.

---

## Adding a changeset (required for every user-facing PR)

```bash
npx changeset
```

The interactive prompt asks for:
1. The bump level — `patch` / `minor` / `major`
2. A summary line — becomes the `CHANGELOG.md` entry

Commits the markdown file under `.changeset/` — include it in your PR.

PRs that change only docs, tests, internal types, build config, or CI **do not** need a changeset.

---

## Release flow

Releases are automated by the [Changesets GitHub Action](.github/workflows/publish.yml):

1. PR with code change + changeset is merged into `main`.
2. Action sees pending changesets and opens (or updates) a **"chore: version packages"** PR. This PR bumps `package.json`, regenerates `CHANGELOG.md`, and deletes consumed changeset files.
3. Merging the version PR triggers the action again, which runs `npm publish` with provenance enabled.

No manual `npm version` or `npm publish` commands are needed.

### Optional: dual-publish to JSR

[JSR](https://jsr.io) is a TypeScript-native registry. Configuration lives in [`jsr.json`](jsr.json) under `@lahin31/amu-http`. After npm publish:

```bash
npx jsr publish
```

Currently manual; wire into the publish workflow once a JSR scope is verified.

### Required repo configuration (one-time)

- **Secret**: `NPM_TOKEN` — must be a [Granular](https://docs.npmjs.com/creating-and-viewing-access-tokens) or **Automation** token (Classic tokens cannot publish with provenance).
- **Settings → Actions → General**: "Allow GitHub Actions to create and approve pull requests" must be enabled.
- **Settings → Actions → General → Workflow permissions**: "Read and write permissions" enabled.
- **Settings → Code security**: enable **CodeQL**, **Dependabot alerts**, and **Private vulnerability reporting**.

Provenance is set via `NPM_CONFIG_PROVENANCE=true` in the workflow env, giving the published package a verified-build badge linking to the GitHub Actions run.

---

## CI

| Workflow | Trigger | What |
|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) — `Test (Node X)` | PR + push to `main` | `npm ci`, lint, typecheck, test, build, verify, size — across Node **20.3 / 22** |
| [`ci.yml`](.github/workflows/ci.yml) — `Typecheck (TypeScript X)` | PR + push to `main` | `tsc --noEmit` against TypeScript **5.5 / 5.8 / 6.0** |
| [`runtime-smoke.yml`](.github/workflows/runtime-smoke.yml) | PR + push to `main` | Builds `dist/` and runs smoke tests on **Bun** and **Deno** |
| [`codeql.yml`](.github/workflows/codeql.yml) | PR + push + weekly schedule | CodeQL `security-and-quality` analysis |
| [`publish.yml`](.github/workflows/publish.yml) | push to `main` | All checks, then `changesets/action@v1` for version PR / publish |

A PR cannot be merged until the entire CI matrix passes.

---

## Code conventions

- **Functional core, no class** in the public API. `class Amu` does not exist in v2.
- **No runtime dependencies**. The package must remain dependency-free. Type-only `Schema` interop is satisfied by an inlined Standard Schema spec.
- **No environment-specific code paths**: no `typeof window`, no `process.env`. Code must work identically in Node, browsers, edge runtimes, Deno, Bun.
- **`sideEffects: false`** is declared. No module-level side effects (no `console.log` outside `logger()`, no global registration, no monkey-patching).
- **Errors must be one of the five exported error classes**. Do not throw raw `Error` from inside the library.
- **Imports**: use the `@/` alias for cross-folder imports. No `.js` extensions (Bundler resolution).
- **Type-only imports**: prefer `import type { ... }` — Biome enforces via `useImportType`.
- **Middleware**: must use `defineMiddleware(name, fn, order?)` for built-ins to get debug-friendly names. User middleware can be plain functions.
- **Frozen contexts**: never mutate `RequestContext`. Use `withHeader`, `withMeta`, `withSignal`.

---

## Reporting bugs / requesting features

Open an issue using the templates in [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/). For security vulnerabilities, follow [SECURITY.md](SECURITY.md) — use private vulnerability reporting, never a public issue.
