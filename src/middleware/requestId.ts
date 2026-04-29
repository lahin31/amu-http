import { withHeader } from '@/request';
import { defineMiddleware, type Middleware } from '@/types/middleware';

export interface RequestIdOptions {
  /** Header name. Defaults to `x-request-id`. */
  readonly header?: string;
  /** ID generator. Defaults to `crypto.randomUUID()`. */
  readonly generator?: () => string;
  /**
   * If true, an existing header is preserved unchanged (e.g. when an
   * upstream gateway already sets one). Defaults to `true`.
   */
  readonly preserveExisting?: boolean;
}

/**
 * Stamp every request with a unique `x-request-id` header so it shows up in
 * server logs / distributed tracing. Tiny, dependency-free, runtime-agnostic.
 */
export function requestId(options: RequestIdOptions = {}): Middleware {
  const header = options.header ?? 'x-request-id';
  const generator = options.generator ?? defaultGenerator;
  const preserveExisting = options.preserveExisting ?? true;

  return defineMiddleware(
    'requestId',
    async (ctx, next) => {
      if (preserveExisting && ctx.headers.has(header)) {
        return next(ctx);
      }
      return next(withHeader(ctx, header, generator()));
    },
    'outer',
  );
}

function defaultGenerator(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for runtimes without `crypto.randomUUID` (very old / minimal).
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
