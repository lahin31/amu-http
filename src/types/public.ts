import type { InferSchema, InferUrlParams } from '@/types/infer';
import type { HttpMethod, Middleware } from '@/types/middleware';
import type { Result } from '@/types/result';
import type { StandardSchemaV1 } from '@/types/standard-schema';

/**
 * Anything that can validate an unknown value into a typed one.
 * Standard Schema is preferred (Zod 3.24+, Valibot 0.31+, ArkType 2+);
 * legacy `.parse` and pure validator functions are also accepted.
 */
export type Schema<T = unknown> =
  | StandardSchemaV1<unknown, T>
  | { parse: (input: unknown) => T | Promise<T> }
  | ((input: unknown) => T | Promise<T>);

/**
 * Per-request schema shape. Either or both ends can be validated.
 *   - body:     validates the outgoing request payload before send
 *   - response: validates the incoming response body before resolving
 */
export interface RequestSchema<TBody = unknown, TResponse = unknown> {
  readonly body?: Schema<TBody>;
  readonly response?: Schema<TResponse>;
}

/**
 * Custom fetch implementation. Plug a wrapped fetch (e.g. with undici dispatcher
 * for connection pooling on Node) here.
 */
export type FetchImpl = (input: string | URL, init?: RequestInit) => Promise<Response>;

/** Configuration for the request retry built-in middleware. */
export interface RetryConfig {
  readonly attempts: number;
  readonly delay?: number | ((attempt: number, error: unknown) => number);
  readonly retryOn?: ReadonlyArray<number | 'network-error'>;
  readonly allowNonIdempotent?: boolean;
}

/** Top-level client configuration. */
export interface ClientConfig {
  readonly baseURL?: string;
  readonly timeout?: number;
  readonly headers?: HeadersInit;
  readonly retries?: number | RetryConfig;
  readonly middleware?: ReadonlyArray<Middleware>;
  readonly fetch?: FetchImpl;
  readonly query?: 'flat';
}

/** Per-request options shared by all methods. */
export interface RequestOptions<S extends RequestSchema = RequestSchema> {
  readonly headers?: HeadersInit;
  readonly query?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  readonly signal?: AbortSignal;
  readonly timeout?: number;
  readonly retries?: number | RetryConfig;
  readonly schema?: S;
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** Response data type inferred from a request schema's `response` slot. */
export type InferResponse<S extends RequestSchema | undefined> = S extends RequestSchema
  ? S['response'] extends Schema
    ? InferSchema<S['response']>
    : unknown
  : unknown;

/** Body argument type inferred from a request schema's `body` slot. */
export type InferRequestBody<S extends RequestSchema | undefined> = S extends RequestSchema
  ? S['body'] extends Schema
    ? StandardSchemaV1.InferInput<
        S['body'] extends StandardSchemaV1 ? S['body'] : StandardSchemaV1<unknown, unknown>
      > extends infer In
      ? In extends never
        ? unknown
        : In
      : unknown
    : unknown
  : unknown;

/**
 * Required URL params object inferred from a path template.
 * `never` if the path has no `:name` segments.
 */
export type RouteParams<Path extends string> = InferUrlParams<Path>;

/**
 * Variadic-tuple branch: paths with no `:name` placeholders make `options` optional;
 * paths with placeholders require `options.params` with the right keys.
 */
type OptionsArgs<Path extends string, S extends RequestSchema> =
  RouteParams<Path> extends never
    ? [options?: RequestOptions<S>]
    : [options: RequestOptions<S> & { readonly params: RouteParams<Path> }];

/** A request method that doesn't take a body (GET, HEAD, DELETE, OPTIONS). */
export type BodylessMethod = <const Path extends string, S extends RequestSchema = RequestSchema>(
  path: Path,
  ...args: OptionsArgs<Path, S>
) => Promise<InferResponse<S>>;

/** A request method that takes a body (POST, PUT, PATCH). */
export type BodyMethod = <const Path extends string, S extends RequestSchema = RequestSchema>(
  path: Path,
  body: InferRequestBody<S>,
  ...args: OptionsArgs<Path, S>
) => Promise<InferResponse<S>>;

/** Safe variant — same surface as the throwing methods, returns Result instead. */
export type SafeBodylessMethod = <
  const Path extends string,
  S extends RequestSchema = RequestSchema,
>(
  path: Path,
  ...args: OptionsArgs<Path, S>
) => Promise<Result<InferResponse<S>>>;

export type SafeBodyMethod = <const Path extends string, S extends RequestSchema = RequestSchema>(
  path: Path,
  body: InferRequestBody<S>,
  ...args: OptionsArgs<Path, S>
) => Promise<Result<InferResponse<S>>>;

/** Options for streaming methods — adds an optional `method` override. */
export type StreamOptions<S extends RequestSchema = RequestSchema> = RequestOptions<S> & {
  readonly method?: HttpMethod;
};

/** A streaming method (raw body) — returns the response's `ReadableStream`. */
export type StreamMethod = (
  path: string,
  options?: StreamOptions,
) => Promise<ReadableStream<Uint8Array>>;

/**
 * The Client returned by createClient. No class — just a frozen object.
 *
 * `stream()` is the only streaming primitive on the client. Compose with the
 * standalone tree-shakable parsers to consume specific protocols:
 *
 * @example
 *   import { createClient, parseSSE, parseNDJSON } from 'amu-http';
 *
 *   for await (const evt of parseSSE(await client.stream('/feed'))) { ... }
 *   for await (const item of parseNDJSON(await client.stream('/log'))) { ... }
 */
export interface Client {
  readonly get: BodylessMethod;
  readonly delete: BodylessMethod;
  readonly head: BodylessMethod;
  readonly options: BodylessMethod;
  readonly post: BodyMethod;
  readonly put: BodyMethod;
  readonly patch: BodyMethod;
  readonly stream: StreamMethod;
  readonly safe: {
    readonly get: SafeBodylessMethod;
    readonly delete: SafeBodylessMethod;
    readonly head: SafeBodylessMethod;
    readonly options: SafeBodylessMethod;
    readonly post: SafeBodyMethod;
    readonly put: SafeBodyMethod;
    readonly patch: SafeBodyMethod;
  };
}
