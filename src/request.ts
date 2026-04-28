import { AmuError } from '@/errors/AmuError';
import { AmuNetworkError, type AmuNetworkErrorKind } from '@/errors/AmuNetworkError';
import { AmuUnknownError } from '@/errors/AmuUnknownError';
import { AmuUrlError } from '@/errors/AmuUrlError';
import { AmuValidationError } from '@/errors/AmuValidationError';
import type { Middleware, RequestContext, ResponseContext } from '@/types/middleware';
import type { FetchImpl } from '@/types/public';

/**
 * Compose middleware into a Koa-style onion. Each middleware receives `ctx`
 * and a `next` function; calling `next(ctx)` runs the next middleware (or
 * terminal).
 *
 * Unlike Koa, calling `next()` multiple times is permitted — retry middleware
 * relies on this to re-enter the inner chain on transient failures.
 */
export function composeMiddleware(
  middleware: ReadonlyArray<Middleware>,
  terminal: (ctx: RequestContext) => Promise<ResponseContext>,
): (ctx: RequestContext) => Promise<ResponseContext> {
  return (initialCtx: RequestContext) => {
    const dispatch = (i: number, ctx: RequestContext): Promise<ResponseContext> => {
      const fn = middleware[i];
      if (!fn) return terminal(ctx);
      const next = (nextCtx: RequestContext): Promise<ResponseContext> => dispatch(i + 1, nextCtx);
      return fn(ctx, next);
    };
    return dispatch(0, initialCtx);
  };
}

/**
 * Terminal step: actually call fetch. Network failures are classified into
 * one of the eight `AmuNetworkErrorKind` values via the error's cause chain.
 *
 * HTTP status semantics (throwing `AmuError` on non-2xx) lives in the `parse`
 * middleware so it can include the parsed error body.
 */
export function createTerminal(
  fetchImpl: FetchImpl,
): (ctx: RequestContext) => Promise<ResponseContext> {
  return async (ctx: RequestContext): Promise<ResponseContext> => {
    try {
      const response = await fetchImpl(ctx.url, {
        method: ctx.method,
        headers: ctx.headers,
        body: ctx.body,
        signal: ctx.signal,
      });
      return {
        request: ctx,
        response,
        data: undefined,
        attempt: typeof ctx.meta['attempt'] === 'number' ? ctx.meta['attempt'] : 1,
      };
    } catch (err) {
      if (
        err instanceof AmuError ||
        err instanceof AmuNetworkError ||
        err instanceof AmuUrlError ||
        err instanceof AmuValidationError ||
        err instanceof AmuUnknownError
      ) {
        throw err;
      }
      throw classifyFetchFailure(err, ctx.signal);
    }
  };
}

/** Classify a thrown fetch error into a structured `AmuNetworkError`. */
export function classifyFetchFailure(err: unknown, signal: AbortSignal): AmuNetworkError {
  const kind = detectKind(err, signal);
  const isRetryable = kind !== 'abort' && kind !== 'tls';
  return new AmuNetworkError(kind, isRetryable, err);
}

function detectKind(err: unknown, signal: AbortSignal): AmuNetworkErrorKind {
  if (signal.aborted) {
    return signal.reason === 'amu-timeout' ? 'timeout-active' : 'abort';
  }

  const cause = unwrapCause(err);
  const code = readCode(cause) ?? readCode(err);

  if (code) {
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'EAI_FAIL') return 'dns';
    if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'EHOSTUNREACH')
      return 'connect';
    if (code === 'ECONNRESET' || code === 'EPIPE') return 'reset';
    if (code === 'UND_ERR_HEADERS_TIMEOUT' || code === 'UND_ERR_BODY_TIMEOUT')
      return 'timeout-idle';
    if (code.startsWith('ERR_TLS_') || code === 'CERT_HAS_EXPIRED' || code === 'EPROTO')
      return 'tls';
  }

  if (err instanceof TypeError) return 'unknown';
  return 'unknown';
}

function unwrapCause(err: unknown): unknown {
  if (typeof err !== 'object' || err === null) return undefined;
  if (!('cause' in err)) return undefined;
  return (err as { cause: unknown }).cause;
}

function readCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  if (!('code' in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/** Build an immutable `RequestContext`. Headers are cloned so callers can't mutate them. */
export function createContext(args: {
  url: string;
  method: RequestContext['method'];
  headers: Headers;
  body: BodyInit | null;
  signal: AbortSignal;
  meta?: Readonly<Record<string, unknown>>;
}): RequestContext {
  return Object.freeze({
    url: args.url,
    method: args.method,
    headers: args.headers,
    body: args.body,
    signal: args.signal,
    meta: Object.freeze({ ...(args.meta ?? {}) }),
  });
}

/** Return a new context with updated meta (immutable). */
export function withMeta(
  ctx: RequestContext,
  patch: Readonly<Record<string, unknown>>,
): RequestContext {
  return Object.freeze({
    ...ctx,
    meta: Object.freeze({ ...ctx.meta, ...patch }),
  });
}

/** Return a new context with a single header set. Clones underlying Headers. */
export function withHeader(ctx: RequestContext, name: string, value: string): RequestContext {
  const headers = new Headers(ctx.headers);
  headers.set(name, value);
  return Object.freeze({ ...ctx, headers });
}

/** Return a new context with a different signal (used by timeout middleware). */
export function withSignal(ctx: RequestContext, signal: AbortSignal): RequestContext {
  return Object.freeze({ ...ctx, signal });
}
