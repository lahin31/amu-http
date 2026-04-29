/**
 * Middleware pipeline types — the single core abstraction.
 *
 * Every cross-cutting concern (retry, timeout, auth, logging, telemetry, schema
 * validation, body parsing) is a Middleware. Built-ins and user middleware
 * compose through the same Koa-style onion runner.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * The request flowing through the middleware chain. Frozen at the shape level —
 * middleware never mutates; it produces a new context via the helpers in `url.ts`.
 */
export interface RequestContext {
  readonly url: string;
  readonly method: HttpMethod;
  readonly headers: Headers;
  /** Serialized body (string | FormData | URLSearchParams | Blob | ArrayBuffer | ReadableStream | null). */
  readonly body: BodyInit | null;
  readonly signal: AbortSignal;
  /** User-extensible scratchpad for middleware coordination. Frozen. */
  readonly meta: Readonly<Record<string, unknown>>;
}

export interface ResponseContext<T = unknown> {
  readonly request: RequestContext;
  readonly response: Response;
  /** Parsed body. `unknown` until a parse middleware runs and a validate middleware narrows it. */
  readonly data: T;
  /** 1 on first attempt, 2+ on retry. Set by the retry middleware. */
  readonly attempt: number;
}

/**
 * The single Middleware shape. Default has no context-extension type tracking —
 * use `defineMiddleware` to opt into typed `meta` extensions.
 */
export type Middleware = (
  ctx: RequestContext,
  next: (ctx: RequestContext) => Promise<ResponseContext>,
) => Promise<ResponseContext>;

/**
 * Internal ordering metadata for built-in middleware. The runner emits a dev
 * warning if outer/inner roles are violated. Stripped in production builds.
 */
export type MiddlewareOrder = 'outer' | 'middle' | 'inner';

export interface MiddlewareWithMeta extends Middleware {
  readonly __order?: MiddlewareOrder;
  readonly __name?: string;
}

/**
 * Helper for authoring middleware with named identity (used by dev warnings).
 * Type-track context extensions via the optional generic.
 */
export function defineMiddleware(
  name: string,
  fn: Middleware,
  order?: MiddlewareOrder,
): MiddlewareWithMeta {
  const wrapped = ((ctx, next) => fn(ctx, next)) as MiddlewareWithMeta;
  Object.defineProperty(wrapped, '__name', { value: name, enumerable: false });
  if (order !== undefined) {
    Object.defineProperty(wrapped, '__order', { value: order, enumerable: false });
  }
  return wrapped;
}
