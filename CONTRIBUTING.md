# Contributing to amu-http

Thanks for your interest in contributing. This document covers everything you need to develop, test, and release the package.

For security issues, see [SECURITY.md](SECURITY.md) — **do not** file public issues for vulnerabilities.

---

## Prerequisites

- **Node.js** `>=18` (native `fetch` is required)
- **npm** `>=9`

The package targets Node 18 / 20 / 22, modern browsers, edge runtimes (Cloudflare Workers, Vercel Edge), Deno, and Bun. Code must use only APIs available in all of these (`fetch`, `AbortController`, `URLSearchParams`, `setTimeout`, `Headers`, `Response`).

---

## Setup

```bash
git clone https://github.com/lahin31/amu-http.git
cd amu-http
npm ci
```

`npm ci` runs the `prepare` script, which registers a pre-commit git hook via `simple-git-hooks`. From this point on, every `git commit` runs `lint-staged` → `biome check --write` on staged files only. To bypass once (don't make a habit of it): `SKIP_SIMPLE_GIT_HOOKS=1 git commit ...`.

---

## Project layout

```
src/
  index.ts             # public entry — re-exports only
  client/              # AmuClient — request lifecycle, retries, parsing
  factory/             # createAmu — hybrid callable + instance factory
  errors/              # AmuError, AmuNetworkError, AmuUrlError, AmuValidationError
  types/public.ts      # exported public types
  utils/http.ts        # URL building, retry classification, body parsing
tests/
  unit/                # node-env unit tests
  browser/             # happy-dom-env smoke tests
  types/               # *.test-d.ts — expectTypeOf assertions on public API
bench/                 # vitest bench microbenchmarks
examples/              # runnable TypeScript usage examples
scripts/               # smoke.ts, smoke-deno.ts — multi-runtime sanity checks
.changeset/            # version intents (one file per change)
.github/
  workflows/           # CI, publish, codeql, runtime-smoke
  ISSUE_TEMPLATE/      # bug.yml, feature.yml, config.yml
  PULL_REQUEST_TEMPLATE.md
  dependabot.yml
```

Path alias `@/*` → `src/*` is set in [`tsconfig.json`](tsconfig.json) and mirrored in [`vitest.config.ts`](vitest.config.ts). tsdown reads it directly from tsconfig. The alias is build-time only — the published `dist/` has zero alias references.

---

## Tooling

| Tool | Purpose | Config |
|---|---|---|
| **tsdown** (rolldown) | Bundling, minification, `.d.ts` emit | [`tsdown.config.ts`](tsdown.config.ts) |
| **TypeScript** | Type checking only (no emit) | [`tsconfig.json`](tsconfig.json) |
| **Biome** | Lint + format (single tool, replaces ESLint+Prettier) | [`biome.json`](biome.json) |
| **Vitest** | Unit tests, browser-env smoke tests, type-level tests, coverage, benchmarks | [`vitest.config.ts`](vitest.config.ts) |
| **happy-dom** | Browser-like DOM environment for `tests/browser/` | per-file `// @vitest-environment happy-dom` directive |
| **size-limit** | Bundle-size CI gate | `size-limit` block in [`package.json`](package.json) |
| **publint** | Validates `package.json` exports / files / fields | — |
| **arethetypeswrong** | Validates type resolution across `node10`, `node16-CJS`, `node16-ESM`, `bundler` | — |
| **simple-git-hooks** + **lint-staged** | Pre-commit lint/format on staged files | `simple-git-hooks` + `lint-staged` blocks in [`package.json`](package.json) |
| **tsx** | Run TypeScript example files directly | — |
| **Changesets** | Versioning + changelog + npm publish | [`.changeset/config.json`](.changeset/config.json) |
| **Dependabot** | Weekly grouped dep PRs | [`.github/dependabot.yml`](.github/dependabot.yml) |
| **CodeQL** | SAST scanner (security + quality queries) | [`.github/workflows/codeql.yml`](.github/workflows/codeql.yml) |
| **JSR** | Optional dual publish to jsr.io | [`jsr.json`](jsr.json) |

The build emits dual ESM (`dist/index.mjs`) + CJS (`dist/index.cjs`) with separate `.d.mts` / `.d.cts` declarations and no source maps (the package does not ship `src/`, so maps would be dead weight).

---

## Scripts

```bash
# Quality gates
npm run lint           # biome check (lint + format check + import sort)
npm run lint:fix       # biome check --write (auto-fix safe issues)
npm run format         # biome format --write
npm run format:check   # biome format (no write)
npm run typecheck      # tsc --noEmit

# Tests
npm test               # vitest run — unit + browser + type tests
npm run test:watch     # vitest watch
npm run test:coverage  # vitest with v8 coverage (enforced thresholds)
npm run test:types     # vitest --typecheck.only (just *.test-d.ts)

# Benchmarks
npm run bench          # vitest bench --run

# Build
npm run build          # tsdown — emits dist/
npm run dev            # tsdown --watch
npm run clean          # rm -rf dist

# Validation
npm run verify         # publint && attw --pack
npm run size           # size-limit (enforces ESM + CJS gzip budgets)

# Examples (require dist/)
npm run example:get
npm run example:post
npm run example:bearer
npm run example:retry:safe
npm run example:retry:advanced
```

`npm run prepublishOnly` chains `lint → typecheck → build → verify → size` and runs automatically before any `npm publish`.

### Test categories

| Folder | Environment | What | Runs in |
|---|---|---|---|
| `tests/unit/` | `node` | Unit tests against mocked `fetch` | `npm test`, every CI matrix entry |
| `tests/browser/` | `happy-dom` | Smoke tests verifying browser-like globals (Headers, Response, URL, AbortSignal) | `npm test`, every CI matrix entry |
| `tests/types/*.test-d.ts` | (typecheck only) | `expectTypeOf` assertions on public API surface | `npm test`, every CI matrix entry |
| `bench/*.bench.ts` | `node` | Microbenchmarks via tinybench | `npm run bench` (manual) |
| `scripts/smoke.ts` | Node / Bun / Deno | Multi-runtime smoke against built `dist/` | `runtime-smoke.yml` workflow |

### Coverage thresholds

`vitest run --coverage` fails if coverage drops below the thresholds in [`vitest.config.ts`](vitest.config.ts). Current floors: **75 / 80 / 65 / 75** (lines/branches/functions/statements). These are intentionally set at today's measured level as a ratchet — **raise** them with every PR that improves coverage, **never lower** without explicit justification in the PR description. `src/types/**` and `src/index.ts` (pure re-export module) are excluded since they have no runtime behaviour to cover.

### Bundle-size budget

`size-limit` enforces a hard gzip budget per output. Current limits: **2 KB ESM** / **2.1 KB CJS** gzip. If a PR pushes either bundle over budget, CI fails. Update the limit in `package.json` only when the growth is intentional and discussed.

### Type-level tests

Files matching `tests/**/*.test-d.ts` use Vitest's built-in `expectTypeOf` to assert the shape of the public API. They run as a separate `typecheck` suite. **Add a type test for any new exported type, generic, or change to a request method's return type** — these are the contract with consumers.

---

## Adding a changeset (required for every user-facing PR)

When you make a change that affects the published package, record it as a changeset before opening the PR:

```bash
npx changeset
```

The interactive prompt asks for:
1. The bump level — `patch` (bug fix) / `minor` (new feature) / `major` (breaking change)
2. A summary line — this becomes the `CHANGELOG.md` entry

This writes a markdown file under `.changeset/`. **Commit it with your PR.**

PRs that change only docs, tests, internal types, build config, or CI **do not** need a changeset.

---

## Release flow

Releases are fully automated by the [Changesets GitHub Action](.github/workflows/publish.yml):

1. PR with code change + changeset is merged into `main`.
2. The action sees pending changesets and opens (or updates) a **"chore: version packages"** PR. This PR bumps `package.json`, regenerates `CHANGELOG.md`, and deletes the consumed changeset files.
3. Merging the version PR triggers the action again, which runs `npm publish` with provenance enabled.

No manual `npm version` or `npm publish` commands are needed.

### Optional: dual-publish to JSR

[JSR](https://jsr.io) is a TypeScript-native registry that distributes raw `.ts` source. Configuration lives in [`jsr.json`](jsr.json) under `@lahin31/amu-http`. To publish a release to JSR after the npm publish:

```bash
npx jsr publish
```

This is currently manual; wire it into the publish workflow once a JSR scope is verified for the project.

### Required repo configuration (one-time, already done)

- **Secret**: `NPM_TOKEN` — must be a [Granular](https://docs.npmjs.com/creating-and-viewing-access-tokens) or **Automation** token (Classic tokens cannot publish with provenance).
- **Settings → Actions → General**: "Allow GitHub Actions to create and approve pull requests" must be enabled — required for the Changesets action to open the version PR.
- **Settings → Actions → General → Workflow permissions**: "Read and write permissions" enabled.
- **Settings → Code security**: enable **CodeQL**, **Dependabot alerts**, and **Private vulnerability reporting**.

Provenance is set via `NPM_CONFIG_PROVENANCE=true` in the workflow env, which makes the published package show a verified-build badge on npmjs.com linking back to the GitHub Actions run.

---

## CI

| Workflow | Trigger | What |
|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) — `Test (Node X)` | PR + push to `main` | `npm ci`, lint, typecheck, test (unit + browser + type), build, verify (publint + attw), size — across Node **18 / 20 / 22** |
| [`ci.yml`](.github/workflows/ci.yml) — `Typecheck (TypeScript X)` | PR + push to `main` | `tsc --noEmit` against TypeScript **5.5 / 5.8 / 6.0** to catch type-system regressions for older consumers |
| [`runtime-smoke.yml`](.github/workflows/runtime-smoke.yml) | PR + push to `main` | Builds `dist/` and runs `scripts/smoke.ts` on **Bun** and **Deno** to verify multi-runtime compat |
| [`codeql.yml`](.github/workflows/codeql.yml) | PR + push to `main` + weekly schedule | CodeQL `security-and-quality` analysis on JS/TS |
| [`publish.yml`](.github/workflows/publish.yml) | push to `main` | All of the above checks, then `changesets/action@v1` for the version PR / publish flow with `NPM_CONFIG_PROVENANCE=true` |

A PR cannot be merged until the entire CI matrix passes.

---

## Reporting bugs / requesting features

Open an issue using the templates in [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/). Bug reports are routed through a structured form to ensure we get a runtime + version + minimal repro. Feature requests focus on the underlying need before any specific API proposal.

For security vulnerabilities, follow [SECURITY.md](SECURITY.md) — use private vulnerability reporting, **never** a public issue.

---

## Code conventions

- **TypeScript strict mode** is on. No `any`, no `// @ts-ignore` without a comment explaining why.
- **No runtime dependencies**. The package must remain dependency-free.
- **No environment-specific code paths** (no `typeof window`, no `process.env` checks). Use only the universal subset: `fetch`, `AbortController`, `URLSearchParams`, `setTimeout`, `Headers`, `Response`.
- **`sideEffects: false`** is declared. Do not add module-level side effects (e.g. `console.log`, monkey-patching globals, registering listeners) — this would break tree-shaking guarantees for consumers.
- **Errors must be one of the four exported error classes** (`AmuError`, `AmuNetworkError`, `AmuUrlError`, `AmuValidationError`). Do not throw raw `Error`.
- **Imports**: use the `@/` alias for cross-folder imports inside `src/` and `tests/`. No `.js` extensions (Bundler resolution).
- **Type-only imports**: prefer `import type { ... }` for types — Biome enforces this via `useImportType`.
