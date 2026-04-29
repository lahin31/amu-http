# Quality bar for `@amu-http/*` adjacent packages

The bar a package must clear to ship under the `@amu-http/*` scope. Third-party plugins under any other namespace are unconstrained — see [PLUGIN_AUTHORING.md](./PLUGIN_AUTHORING.md) for that.

This document is the binary checklist. New packages and major releases must pass every required item. Optional items are improvements over time.

---

## Required (must pass before publication)

### Code

- [ ] **Zero `any`** in `src/`. Lint-enforced via Biome `noExplicitAny: error`.
- [ ] **Strict TypeScript** — `strict: true`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`.
- [ ] **No `as` casts** outside documented boundaries. Each cast site has a code comment explaining why.
- [ ] **No runtime `dependencies`**. `peerDependencies` (with `optional: true` if not strictly required) are fine.
- [ ] **`peerDependencies.amu-http`** set to `^X.0.0` for the supported major.
- [ ] **`sideEffects: false`** in `package.json`.
- [ ] **ESM-only**. No CJS dual-format unless documented exception.
- [ ] **Targets ES2022** at minimum. Lower targets accepted only with explicit reasoning.

### Tests

- [ ] **≥ 90 / 85 / 95 / 90** coverage (lines / branches / functions / statements).
- [ ] **Type-level tests** for every public generic. `*.test-d.ts` files using `expectTypeOf`.
- [ ] **Unit tests** for every public function, including error paths.
- [ ] **Concurrency test** if the package holds state (rate limiter, cache, jar). Verify N concurrent requests don't corrupt state.
- [ ] **Cancellation test** — `AbortController` mid-request leaves no leaks.
- [ ] **CI runs on Node 20.3 + 22 minimum**. Bun and Deno smoke if the package is universal.
- [ ] **Tests pass in `happy-dom` environment** for browser-targeting packages.

### Build

- [ ] **size-limit budget** declared in `package.json` for the published bundle.
- [ ] **publint** clean.
- [ ] **arethetypeswrong --pack** clean (`cjs-resolves-to-esm` and `no-resolution` may be ignored for ESM-only sub-paths).
- [ ] **Multi-entry build** if the package has more than one logical surface (e.g., `core` + `react-bindings`). Per-file exports under `package.json` `exports` map.
- [ ] **No unused exports** in `dist/`. Tree-shake-correct.

### Documentation

- [ ] **README** with: overview, install command, quick example, configuration table, recommended-placement note (for middleware), performance characteristics, compatibility table.
- [ ] **JSDoc / TSDoc** on every public export. Hover types are readable.
- [ ] **Quick example runs** — copy-paste from README into a fresh project should work.
- [ ] **Compatibility table** showing which amu-http major versions are supported.
- [ ] **CHANGELOG.md** with all releases. Use Changesets.

### Release process

- [ ] **Changesets-managed releases**. Every PR with user-facing changes adds a changeset.
- [ ] **npm provenance** on every published version (`npm publish --provenance`).
- [ ] **Semver respected**. Breaking changes only on major.
- [ ] **Deprecation policy** documented. Behavior preserved for ≥ 1 minor before removal; removal only on major.
- [ ] **Release notes** linked from every GitHub Release.

### Security

- [ ] **SECURITY.md** present. Lists vulnerability reporting channel.
- [ ] **CodeQL or equivalent SAST** configured.
- [ ] **Dependabot or Renovate** active for automated dep updates.
- [ ] **No secrets in tests**. Real-API integration tests use sandbox credentials only.
- [ ] **No telemetry phone-home**. Documented commitment in README.

### Identity

- [ ] **Repo topic** `amu-http-plugin` set on GitHub.
- [ ] **README badge** linking back to the amu-http main repo.
- [ ] **MIT or Apache-2.0 license** (consistent with amu's MIT).
- [ ] **Commits signed** (GPG, SSH, or attested via GitHub's signed commit).

---

## Recommended (improvements over time)

### Code

- [ ] **Property-based tests** for any combinatorial logic (URL parsing, header merging, cookie matching).
- [ ] **Fuzz tests** on parsers / unsafe input boundaries.
- [ ] **Memory-leak tests** under sustained load (10K requests, no growth beyond bound).
- [ ] **Mutation testing** (Stryker or equivalent), ≥ 70% mutation score.

### Performance

- [ ] **Microbenchmarks** in `bench/`. Tracked over time.
- [ ] **No regression > 10%** between releases (CI-enforced if feasible).
- [ ] **Cold-start budget** — module evaluation < 5ms on a clean Node process.

### Documentation

- [ ] **Recipe** showing real-world integration (with a real API or framework).
- [ ] **Migration guide** if the package replaces a community alternative.
- [ ] **Architecture notes** for non-trivial packages — how does it work internally?
- [ ] **Browser compatibility** statement (which Web APIs it requires).

### Operability

- [ ] **OpenTelemetry instrumentation** built-in or documented as a recipe.
- [ ] **Metrics emission** via the standard Recorder interface.
- [ ] **Structured logs** through the standard Logger interface.
- [ ] **Configurable redaction** if the package handles sensitive data.

### Ecosystem

- [ ] **Listed in awesome-amu-http** (community-curated list).
- [ ] **Contributing guide** for community PRs.
- [ ] **Discussion forum or Discord channel** for user questions.

---

## Process

### How to apply for `@amu-http/*` namespace

1. Build your package under `amu-http-<name>` (or your scope) and pass the **required** checklist.
2. Open a Discussion in the main amu-http repo with:
   - Package purpose (one paragraph)
   - Link to repo + npm
   - Self-assessment against this checklist
   - Maintenance commitment statement
3. amu maintainers review for: alignment with amu's architectural principles, no overlap with existing packages, willingness to maintain.
4. If approved, the package is renamed to `@amu-http/<name>` and the maintainer is added to the npm scope.
5. Ongoing: maintainer is responsible for keeping the package compatible with new amu majors within 4 weeks of release.

### How packages lose `@amu-http/*` status

- Maintainer becomes unresponsive (no commits or issue replies for 6+ months).
- Required checklist drifts (e.g., test coverage drops below floor and isn't restored).
- Security vulnerability not addressed within the SLO from [SECURITY.md](../SECURITY.md).
- Maintainer requests deprecation.

In any of these cases, the package is moved to `@amu-http-archive/<name>`, marked deprecated on npm, and a successor is sought (community fork or replacement under a new name).

---

## Reference packages (model these)

Once available, these will serve as quality reference:

| Package | What it demonstrates |
|---|---|
| `@amu-http/openapi` | Codegen patterns, monorepo structure, breadth-of-test |
| `@amu-http/react` | Framework integration, peer-dep handling, hook composition |
| `@amu-http/graphql` | Thin adapter pattern, error translation |

When these ship, this section will link to them as worked examples.

---

## Checklist quick reference

For PR reviewers and authors:

```
Required:
□ Zero `any`, strict TS                        □ Tests ≥ 90/85/95/90
□ No runtime deps (peer-deps OK)               □ Type tests for generics
□ ESM-only, sideEffects: false                 □ Concurrency + cancellation tests
□ size-limit + publint + attw clean            □ README + JSDoc + CHANGELOG
□ Changesets + provenance                      □ SECURITY.md + CodeQL
□ Repo topic + license + signed commits

Recommended:
□ Property-based + fuzz tests                  □ Recipe + architecture notes
□ Microbenchmarks                              □ OTel + metrics + logs
□ Mutation testing                             □ Listed in awesome-amu-http
```

If you're at "all required + half recommended," you're at a place users can confidently adopt. Below required is not yet shippable under `@amu-http/*`.
