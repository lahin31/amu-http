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

/** Information passed to the `onAttempt` retry hook before each retry. */
export interface RetryAttemptInfo {
  /** 1-indexed retry count (the FIRST retry is `attempt: 2` because attempt 1 was the initial). */
  readonly attempt: number;
  /** The error that triggered this retry. */
  readonly error: unknown;
  /** Milliseconds amu will sleep before issuing the retry. */
  readonly delayMs: number;
}

/** Configuration for the request retry built-in middleware. */
export interface RetryConfig {
  readonly attempts: number;
  readonly delay?: number | ((attempt: number, error: unknown) => number);
  readonly retryOn?: ReadonlyArray<number | 'network-error'>;
  readonly allowNonIdempotent?: boolean;
  /**
   * Hook fired *before* each retry attempt (not before the initial attempt).
   * Use for telemetry, structured logging, or aborting via the request signal.
   * Async hooks are awaited.
   */
  readonly onAttempt?: (info: RetryAttemptInfo) => void | Promise<void>;
}

/** Top-level client configuration. */
export interface ClientConfig {
  readonly baseURL?: string;
  readonly timeout?: number;
  readonly headers?: HeadersInit;
  readonly retries?: number | RetryConfig;
  readonly middleware?: ReadonlyArray<Middleware>;
  readonly fetch?: FetchImpl;
  readonly querySerializer?: QuerySerializer;
}

/** Per-request options shared by all methods. */
export interface RequestOptions<S extends RequestSchema = RequestSchema> {
  readonly headers?: HeadersInit;
  readonly query?: Readonly<Record<string, unknown>>;
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

/**
 * Resolves the final response type. If a `response` schema is given, its
 * inferred output wins. Otherwise the explicit `TResponse` generic (or its
 * `unknown` default) is used.
 *
 * The `[X] extends [Y]` (non-distributive) form is needed because when no
 * schema is provided, `S['response']` is `Schema<unknown> | undefined`, and
 * distribution would incorrectly take the `InferResponse<S>` branch.
 */
type ResolveResponse<TResponse, S extends RequestSchema> = [S['response']] extends [Schema]
  ? InferResponse<S>
  : TResponse;

/**
 * A request method that doesn't take a body (GET, HEAD, DELETE, OPTIONS).
 *
 * Two ways to type the response (schema wins when both are provided):
 *
 *   client.get<User>('/u/:id', { params: { id: 1 } })                       // explicit generic
 *   client.get('/u/:id', { params: { id: 1 }, schema: { response: User } }) // inferred from schema
 */
export type BodylessMethod = <
  TResponse = unknown,
  const Path extends string = string,
  S extends RequestSchema = RequestSchema,
>(
  path: Path,
  ...args: OptionsArgs<Path, S>
) => Promise<ResolveResponse<TResponse, S>>;

/** A request method that takes a body (POST, PUT, PATCH). */
export type BodyMethod = <
  TResponse = unknown,
  const Path extends string = string,
  S extends RequestSchema = RequestSchema,
>(
  path: Path,
  body: InferRequestBody<S>,
  ...args: OptionsArgs<Path, S>
) => Promise<ResolveResponse<TResponse, S>>;

/** Safe variant — same surface as the throwing methods, returns Result instead. */
export type SafeBodylessMethod = <
  TResponse = unknown,
  const Path extends string = string,
  S extends RequestSchema = RequestSchema,
>(
  path: Path,
  ...args: OptionsArgs<Path, S>
) => Promise<Result<ResolveResponse<TResponse, S>>>;

export type SafeBodyMethod = <
  TResponse = unknown,
  const Path extends string = string,
  S extends RequestSchema = RequestSchema,
>(
  path: Path,
  body: InferRequestBody<S>,
  ...args: OptionsArgs<Path, S>
) => Promise<Result<ResolveResponse<TResponse, S>>>;

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
  /**
   * Create a new client that inherits this one's config and middleware,
   * applying overrides on top. Headers are merged; middleware is appended
   * (extension middleware sits inside parent middleware in the onion); other
   * fields override.
   *
   * @example
   *   const api    = createClient({ baseURL: 'https://api.example.com' });
   *   const authed = api.extend({ middleware: [bearerAuth(token)] });
   *   const v2     = api.extend({ baseURL: 'https://api.example.com/v2' });
   */
  readonly extend: (overrides: ClientConfig) => Client;
}

/**
 * Query string serializer.
 *
 *   'flat' — `{ a: 1, b: [1, 2] }` → `a=1&b=1%2C2` (comma-joined arrays).
 *   'qs'   — bracketed nested syntax, like `qs.stringify`:
 *            `{ filter: { status: 'a' } }` → `filter[status]=a`.
 *   custom — full control: receives the raw query object, returns the string.
 */
export type QuerySerializer =
  | 'flat'
  | 'qs'
  | ((query: Readonly<Record<string, unknown>>) => string);
