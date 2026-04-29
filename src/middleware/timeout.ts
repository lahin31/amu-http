import { withSignal } from '@/request';
import { defineMiddleware, type Middleware } from '@/types/middleware';

/**
 * Wrap the request in a timeout. When the timer fires we abort with the
 * sentinel reason `"amu-timeout"` so the network-error classifier can
 * distinguish active timeouts from user-triggered aborts.
 *
 * The user's original `signal` is composed via `AbortSignal.any`, so cancelling
 * either path cancels the request.
 */
export function timeout(defaultMs: number): Middleware {
  return defineMiddleware(
    'timeout',
    async (ctx, next) => {
      const override = ctx.meta['timeout'];
      const ms = typeof override === 'number' ? override : defaultMs;
      if (ms <= 0) return next(ctx);

      const controller = new AbortController();
      const combined = AbortSignal.any([ctx.signal, controller.signal]);
      const timer = setTimeout(() => controller.abort('amu-timeout'), ms);

      try {
        return await next(withSignal(ctx, combined));
      } finally {
        clearTimeout(timer);
      }
    },
    'middle',
  );
}
