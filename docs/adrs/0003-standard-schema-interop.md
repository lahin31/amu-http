# ADR 0003 — Standard Schema for validator interop

**Status:** Accepted (2026-04, with v2.0)

## Context

Schema-based runtime validation is one of v2's three wedges. The question was: which validator do we couple to?

The candidates in early 2026:

- **Zod** — most-used, large ecosystem, but the v3 → v4 migration is real friction.
- **Valibot** — modular, smaller bundles, growing fast.
- **ArkType** — fastest at runtime, type-level inference is exceptional.
- **Yup, io-ts, runtypes, superstruct, json-schema** — older / less-used.

Coupling to one of these would tie amu's success to that validator's continued health. It would also force users on a different validator to either add a second one or wrap.

In late 2024, the Zod / Valibot / ArkType maintainers (and several others) converged on a cross-validator interop spec: **Standard Schema v1**. It's a small interface — every spec-conforming validator exposes `~standard.validate(value)` returning `{ value }` or `{ issues }`. Importantly:

- It's a stable interface, not a wrapper library.
- Adoption was already real (Zod 3.24+, Valibot 0.31+, ArkType 2+ at the time of decision).
- It doesn't require us to depend on any validator package.

## Decision

amu-http accepts **any Standard Schema v1**-conforming value wherever a `Schema<T>` is expected. We inline the Standard Schema spec types in `src/types/standard-schema.ts` (zero runtime dep) and detect spec-conforming schemas at runtime via the `~standard` property.

Fallback paths for non-Standard-Schema validators:

```ts
type Schema<T = unknown> =
  | StandardSchemaV1<unknown, T>                           // primary
  | { parse: (input: unknown) => T | Promise<T> }          // legacy: older Zod, Joi-style
  | ((input: unknown) => T | Promise<T>);                  // bare validator function
```

Type inference (`InferSchema<S>`) prefers the Standard Schema path; falls back to legacy `.parse` and bare-function types.

## Consequences

### Positive

- **No coupling to a specific validator.** Users pick their preferred validator; amu doesn't care.
- **Forward compatibility.** New Standard Schema implementations (Effect Schema, etc.) work automatically.
- **Zero runtime deps.** The spec is type-only; we inline it.
- **Inference works for the spec.** `InferSchema<typeof userSchema>` returns the exact validated output type from any spec-conforming validator.
- **Legacy fallbacks.** Users on older Zod versions or with custom validators are not blocked; they lose the type-inference benefit but runtime works.

### Negative

- **Spec drift risk.** If Standard Schema bumps to v2 with breaking changes, we'd need to support both v1 and v2 in our interop type. Mitigation: the spec is governed by a working group with explicit v1-stability commitment; v2 is not on the horizon as of 2026-04.
- **Slightly more complex `InferSchema`.** Three branches in the conditional type. Documented; tested.
- **Users with non-spec-conforming validators get worse types.** The fallback paths exist but produce `Awaited<ReturnType>`-style inference, which may not match expectations for transform-heavy validators. Documented.

## Alternatives considered

### Couple to Zod

Rejected. Most popular validator, but coupling makes amu sticky to Zod's release cadence and forces non-Zod users to add Zod as a second validator. Also: the Zod 3 → 4 migration was a moving target during our design window.

### Define our own validator interface

Rejected. Reinvents Standard Schema with worse adoption. The whole point of the spec is that users don't have to learn a new interface for every library.

### Provide adapters per validator

Considered. `amu-http/adapters/zod`, `amu-http/adapters/valibot`, etc. Adds API surface and documentation burden. Standard Schema removes the need.

### Skip schemas entirely; just type generics

Rejected. The schema-validated boundary is one of v2's three wedges. Without runtime validation, types are aspirational, not load-bearing.

## See also

- [standardschema.dev](https://standardschema.dev) — the spec
- `src/types/standard-schema.ts` — inlined spec
- `src/middleware/validate.ts` — runtime path
- `tests/contract/standard-schema.test.ts` — interop matrix
