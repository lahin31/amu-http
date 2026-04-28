import { AmuError } from '@/errors/AmuError';
import { AmuNetworkError } from '@/errors/AmuNetworkError';
import { withMeta } from '@/request';
import { defineMiddleware, type Middleware } from '@/types/middleware';
import type { RetryConfig } from '@/types/public';

const IDEMPOTENT_METHODS = new Set<string>(['GET', 'HEAD', 'OPTIONS']);
const DEFAULT_RETRY_TARGETS: ReadonlyArray<number | 'network-error'> = ['network-error'];

interface NormalizedPolicy {
  readonly attempts: number;
  readonly delay: (attempt: number, error: unknown) => number;
  readonly retryOn: ReadonlyArray<number | 'network-error'>;
  readonly allowNonIdempotent: boolean;
}

export function normalizeRetryPolicy(input: number | RetryConfig | undefined): NormalizedPolicy {
  if (input === undefined || input === null) {
    return {
      attempts: 0,
      delay: () => 0,
      retryOn: DEFAULT_RETRY_TARGETS,
      allowNonIdempotent: false,
    };
  }
  if (typeof input === 'number') {
    return {
      attempts: Math.max(0, input),
      delay: () => 0,
      retryOn: DEFAULT_RETRY_TARGETS,
      allowNonIdempotent: false,
    };
  }
  return {
    attempts: Math.max(0, input.attempts),
    delay:
      typeof input.delay === 'function'
        ? input.delay
        : typeof input.delay === 'number'
          ? () => input.delay as number
          : () => 0,
    retryOn: input.retryOn?.length ? input.retryOn : DEFAULT_RETRY_TARGETS,
    allowNonIdempotent: input.allowNonIdempotent ?? false,
  };
}

/**
 * Retry the inner middleware chain on transient failures.
 *
 *   - Only retries idempotent methods (GET/HEAD/OPTIONS) unless `allowNonIdempotent`.
 *   - Retries `AmuNetworkError` when its `isRetryable` flag is true (default).
 *   - Retries `AmuError` only if `error.status` is in `retryOn`.
 *   - Schema validation failures (`AmuValidationError`) are NEVER retried —
 *     a 200 with the wrong shape is a stable bad response.
 */
export function retry(defaultInput?: number | RetryConfig): Middleware {
  const defaultPolicy = normalizeRetryPolicy(defaultInput);

  return defineMiddleware(
    'retry',
    async (ctx, next) => {
      const override = ctx.meta['retries'];
      const policy =
        override === undefined
          ? defaultPolicy
          : normalizeRetryPolicy(override as number | RetryConfig);
      let attempt = 1;
      let remaining = policy.attempts;
      while (true) {
        try {
          return await next(withMeta(ctx, { attempt }));
        } catch (err) {
          if (
            remaining > 0 &&
            shouldRetryMethod(ctx.method, policy.allowNonIdempotent) &&
            shouldRetryError(err, policy.retryOn)
          ) {
            const wait = policy.delay(attempt, err);
            if (wait > 0) await new Promise((r) => setTimeout(r, wait));
            attempt += 1;
            remaining -= 1;
            continue;
          }
          throw err;
        }
      }
    },
    'outer',
  );
}

function shouldRetryMethod(method: string, allowNonIdempotent: boolean): boolean {
  if (allowNonIdempotent) return true;
  return IDEMPOTENT_METHODS.has(method);
}

function shouldRetryError(err: unknown, retryOn: ReadonlyArray<number | 'network-error'>): boolean {
  if (err instanceof AmuNetworkError) return err.isRetryable;
  if (err instanceof AmuError) return retryOn.includes(err.status);
  return false;
}
