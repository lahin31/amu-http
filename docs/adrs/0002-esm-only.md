# ADR 0002 — ESM-only distribution

**Status:** Accepted (2026-04, with v2.0)
**Supersedes:** v1's dual ESM + CJS

## Context

v1 shipped both ESM (`dist/index.mjs`) and CJS (`dist/index.cjs`) via the `exports` map. This is the safe default; nobody complains.

By 2026, the cost of dual-format had grown:

1. **Dual-package hazard.** A user who imports the same library through both module systems (one in app code, one in a transitive dep) gets two copies of every class. `instanceof` checks fail across boundaries. The fix (singleton patterns, dual-format awareness) is a chronic source of bugs in the JS ecosystem.
2. **Build complexity.** Dual emit doubles the build artifact count. tsdown handles it, but every per-file entry point doubled. Multi-entry × dual-format × type-emission = a lot of moving parts.
3. **Tree-shaking nuances.** Bundlers tree-shake ESM cleanly and CJS poorly. Shipping both lets a misconfigured bundler silently include CJS, breaking size budgets.
4. **Modern runtimes are ESM-native.** Node 20+, Bun, Deno, Vite, Webpack 5+, Rollup, esbuild all handle ESM as a first-class citizen. The CJS fallback is only needed for legacy projects that can't / haven't migrated.

The question: does the v2 audience include legacy CJS users? Polling existing v1 download patterns plus broader ecosystem trends (date-fns 4 went ESM-only, Vite 7 ESM-only, Vitest 3 ESM-only): the cost of locking out CJS users is small and shrinking; the cost of dual-format complexity is not.

## Decision

amu-http v2 ships **ESM-only**. `dist/` contains only `.mjs` and `.d.mts`. No `.cjs`. No `require.cjs` shim. `package.json` has no `main` field; `module` and `types` point at the ESM artifacts.

CJS users have three options:
- Migrate to ESM.
- Use dynamic `import()` from CJS code (`const { createClient } = await import('amu-http')`).
- Stay on amu-http v1 (frozen but available).

If real adoption pain emerges, an opt-in `@amu-http/cjs-shim` adjacent package can be built later. Not done speculatively.

## Consequences

### Positive

- **No dual-package hazard.** One copy of every class everywhere.
- **Halved build matrix.** ~50% fewer dist files, ~30% faster builds, simpler tsdown config.
- **Smaller `node_modules`.** Per-package, dropping CJS halves the published artifact size.
- **Clean tree-shaking.** Bundlers see only ESM; no fallback path to silently bloat the bundle.
- **Clearer engines field.** `node >= 20.3` is honest — that's where native fetch + ESM are first-class.

### Negative

- **CJS users are blocked from v2.** Real cost. Mitigated by: (a) v1 still works, (b) dynamic import escape hatch, (c) future shim package if demand emerges.
- **One-way migration.** If we wanted to add CJS back later, we'd need a major version bump (because reintroducing it changes `exports` map shape in a way some bundlers care about). Acceptable cost.
- **`arethetypeswrong` reports `cjs-resolves-to-esm` warnings.** Suppressed via `--ignore-rules cjs-resolves-to-esm` because that's the deliberate posture, not a mistake.

## Alternatives considered

### Keep dual-format

Rejected. The complexity tax is real and grows; the user benefit shrinks every quarter as CJS adoption declines.

### Ship ESM as default, optional CJS via separate entry (`amu-http/cjs`)

Considered. Adds API surface and documentation burden for a use case that isn't proven. Defer until demand emerges.

### Build a runtime shim (`amu-http/cjs-shim`) at v2.0

Considered. Adds complexity speculatively. Better to gauge real demand from issues / discussions and ship a shim package later if needed.

### Maintain a separate v1.x for CJS users with feature backports

Rejected. Doubling maintenance burden on a one-maintainer project. v1 stays frozen with security fixes only.

## Consequences observed in practice

After 2.0.0-rc.0:
- Zero adoption blockers reported related to CJS in the rc period (sample size: small, but signal is clear).
- Bundle sizes stayed within budget without dual-format overhead.
- Build times improved by ~30%.

If this changes, the `@amu-http/cjs-shim` package is the recovery path; we won't reverse this decision.

## See also

- `tsdown.config.ts` — `format: ['esm']`
- `package.json` — exports map (no `require` conditions for legacy)
- v2 migration guides — `docs/migration-from-axios.md` etc.
