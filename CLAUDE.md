# Claude / AI assistant context — `amu-http`

This file orients automated or human contributors working in this repository.

## What this project is

**amu-http** is a small Fetch-based HTTP client (`Amu` class + default `amu` singleton). It targets ESM-first Node and browsers, exposes typed errors, retries, optional schema validation, `raw: true` (Axios-shaped response), timeouts via `AbortController`, and lifecycle hooks for retries.

## Layout

| Area | Path |
|------|------|
| Client implementation | `src/client/AmuClient.ts` |
| Public config/types | `src/types/public.ts` |
| URL / retry helpers | `src/utils/http.ts` |
| Default instance factory | `src/factory/createAmu.ts` |
| Barrel export | `src/index.ts` |
| Errors | `src/errors/*.ts` |

## Module system (important)

- `package.json` has `"type": "module"`.
- `tsconfig.json` uses **`"module": "NodeNext"`** and **`"moduleResolution": "NodeNext"`**.
- **Relative imports in `.ts` sources use the `.js` extension** (e.g. `'../types/public.js'`) because they refer to emitted output; do not switch to extensionless imports without changing the whole module strategy.

## Build and quality

- **`npm run lint`** — TypeScript check (`tsc --noEmit`).
- **`npm run build`** — `tsup` dual CJS/ESM + declarations into `dist/`.
- **`npm test`** — Vitest.

Run `lint` after non-trivial edits. `prepublishOnly` runs lint + build.

## Design constraints

- Keep the surface area small; avoid feature creep unless explicitly requested.
- Prefer extending `AmuConfig` / `AmuDefaults` in `createDefaults` over ad-hoc globals.
- Timeouts and cancellation: internal timeout `AbortController` must remain composable with caller `signal` (combined abort).
- Hook callbacks (`hooks.onRetry`, etc.) should not throw into user request flow; swallow or document if that changes.
- Match existing formatting and naming in touched files.

## Public API (barrel)

`src/index.ts` exports: `Amu`, `createInstance`, `amu` (default), error classes, and types `AmuConfig`, `AmuPromise`, `AmuRawResponse`, `AmuSchema`, `AmuRetryConfig`, `AmuHybrid`. Additional types may exist in `types/public.ts`; add them to `index.ts` if they should be part of the published surface.

## Documentation

- User-facing behavior belongs in **README.md**.
- Changelog / version bumps follow existing project practice (e.g. `CHANGELOG.md`, release scripts in `package.json`).

## Do not assume

- Do not reference a different architecture (e.g. middleware `createClient` stacks) unless that code exists in this branch.
- When in doubt, open `src/client/AmuClient.ts` and `src/types/public.ts` as the source of truth for runtime behavior.
