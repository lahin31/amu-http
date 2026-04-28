import { defineMiddleware, type Middleware } from '@/types/middleware';

export interface LoggerOptions {
  /** Sink for log lines. Defaults to `console.log`. */
  readonly log?: (message: string) => void;
  /** Sink for error lines. Defaults to `console.error`. */
  readonly error?: (message: string) => void;
  /**
   * `'minimal'`: `→ GET /users` and `← GET /users 200 (12ms)`.
   * `'verbose'`: minimal + headers + response body length.
   */
  readonly level?: 'minimal' | 'verbose';
  /** Per-request guard — return false to skip logging this request. */
  readonly enabled?: (ctx: { method: string; url: string }) => boolean;
}

/**
 * Dev-mode request/response logger. Captures duration and HTTP status; on
 * thrown errors logs the error class name (`AmuError`, `AmuNetworkError`, ...).
 *
 * Cost in production: zero if you don't include this middleware. The logger
 * itself does no work beyond what the sinks accept, so passing `() => {}`
 * sinks effectively disables it without removing it.
 */
export function logger(options: LoggerOptions = {}): Middleware {
  const log = options.log ?? ((msg: string) => console.log(msg));
  const errorSink = options.error ?? ((msg: string) => console.error(msg));
  const level = options.level ?? 'minimal';
  const enabled = options.enabled;

  return defineMiddleware(
    'logger',
    async (ctx, next) => {
      if (enabled && !enabled({ method: ctx.method, url: ctx.url })) return next(ctx);

      const started = performance.now();
      const baseLine = `→ ${ctx.method} ${ctx.url}`;
      log(level === 'verbose' ? `${baseLine} ${formatHeaders(ctx.headers)}` : baseLine);

      try {
        const res = await next(ctx);
        const ms = (performance.now() - started).toFixed(1);
        const status = res.response.status;
        const tail = `← ${ctx.method} ${ctx.url} ${status} (${ms}ms)`;
        if (level === 'verbose') {
          const cl = res.response.headers.get('content-length') ?? '?';
          log(`${tail} body=${cl}`);
        } else {
          log(tail);
        }
        return res;
      } catch (err) {
        const ms = (performance.now() - started).toFixed(1);
        const name = errorName(err);
        errorSink(`✖ ${ctx.method} ${ctx.url} ${name} (${ms}ms)`);
        throw err;
      }
    },
    'outer',
  );
}

function formatHeaders(h: Headers): string {
  const entries: string[] = [];
  h.forEach((value, key) => {
    if (key.toLowerCase() === 'authorization') entries.push(`${key}=<redacted>`);
    else entries.push(`${key}=${value}`);
  });
  return entries.length ? `[${entries.join(', ')}]` : '';
}

function errorName(err: unknown): string {
  if (err instanceof Error) return err.name;
  return 'Unknown';
}
