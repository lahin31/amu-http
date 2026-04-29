import type { StandardSchemaV1 } from '@/types/standard-schema';

/**
 * Infers the validated output type from a schema.
 *
 * Supports:
 *   1. Standard Schema v1 (Zod 3.24+, Valibot 0.31+, ArkType 2+) — first-class.
 *   2. Legacy `{ parse: (input) => T }` interface — used by older Zod and similar.
 *   3. Pure validator function `(input: unknown) => T` — custom guards.
 *   4. Anything else falls back to `unknown`.
 *
 * Order matters: Standard Schema wins over legacy parse so newer Zod versions
 * (which expose both) infer through the spec, not the deprecated parse signature.
 */
export type InferSchema<S> =
  S extends StandardSchemaV1<unknown, infer Out>
    ? Out
    : S extends { parse: (input: unknown) => infer Out | Promise<infer Out> }
      ? Awaited<Out>
      : S extends (input: unknown) => infer Out | Promise<infer Out>
        ? Awaited<Out>
        : unknown;

/**
 * Walk path one segment at a time (split on `/`). A param segment is one that
 * starts with `:`; everything else is ignored. Avoids the `https:` colon trap.
 *
 * Recursion-depth-capped at 24 segments via tuple length.
 */
type ExtractParamsBySegment<
  Path extends string,
  Acc extends string,
  Depth extends ReadonlyArray<unknown>,
> = Depth['length'] extends 24
  ? Acc | string
  : Path extends `${infer Head}/${infer Tail}`
    ? Head extends `:${infer Name}`
      ? ExtractParamsBySegment<Tail, Acc | Name, [...Depth, unknown]>
      : ExtractParamsBySegment<Tail, Acc, [...Depth, unknown]>
    : Path extends `:${infer Name}`
      ? Acc | Name
      : Acc;

/**
 * Required URL params object inferred from a path template.
 *
 * Grammar: `:name` only — alphanumeric + `_`. Anything more exotic
 * (`/files/*path`, `:slug([a-z]+)`, `?optional`) is unsupported.
 *
 * @example
 *   InferUrlParams<'/users/:id'>             → { readonly id: string | number }
 *   InferUrlParams<'/users/:id/posts/:pid'>  → { readonly id; readonly pid }
 *   InferUrlParams<'/users'>                 → never
 *   InferUrlParams<'https://x/users/:id'>    → { readonly id: string | number }
 */
export type InferUrlParams<Path extends string> = [
  ExtractParamsBySegment<Path, never, []>,
] extends [never]
  ? never
  : { readonly [K in ExtractParamsBySegment<Path, never, []>]: string | number };
