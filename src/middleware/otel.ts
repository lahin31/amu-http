/**
 * OpenTelemetry middleware.
 *
 * Creates a span around each request, sets HTTP semantic-convention attributes,
 * and injects W3C `traceparent` (and any other configured) headers so the
 * server-side trace stitches in.
 *
 * Requires `@opentelemetry/api` as a peer dependency. If not installed, this
 * import throws at module-evaluation time with a clear error.
 */

import {
  context as otelContext,
  propagation,
  SpanKind,
  SpanStatusCode,
  type Tracer,
  trace,
} from '@opentelemetry/api';
import { withHeader } from '@/request';
import { defineMiddleware, type Middleware } from '@/types/middleware';

export interface OtelOptions {
  /**
   * Tracer to record spans with. If omitted, falls back to a no-op tracer
   * lazily resolved via `trace.getTracer('amu-http')` on each request, so
   * the middleware works correctly when an SDK is registered later.
   */
  readonly tracer?: Tracer;
  /**
   * Span name builder. Defaults to `HTTP {METHOD}` per OpenTelemetry HTTP
   * semantic conventions. Override for custom routing-aware names.
   */
  readonly spanName?: (ctx: { method: string; url: string }) => string;
  /**
   * Whether to inject the W3C `traceparent` (and `tracestate`) headers into
   * the outgoing request. Default `true`.
   */
  readonly propagate?: boolean;
}

/**
 * @example
 *   import { otel } from 'amu-http/middleware/otel';
 *   import { trace } from '@opentelemetry/api';
 *
 *   const api = createClient({
 *     middleware: [otel({ tracer: trace.getTracer('my-app') })],
 *   });
 */
export function otel(options: OtelOptions = {}): Middleware {
  const spanName = options.spanName ?? ((c: { method: string; url: string }) => `HTTP ${c.method}`);
  const propagate = options.propagate ?? true;

  return defineMiddleware(
    'otel',
    async (ctx, next) => {
      const tracer = options.tracer ?? trace.getTracer('amu-http');
      const url = safeParseUrl(ctx.url);

      const span = tracer.startSpan(spanName({ method: ctx.method, url: ctx.url }), {
        kind: SpanKind.CLIENT,
        attributes: {
          'http.request.method': ctx.method,
          'url.full': ctx.url,
          ...(url
            ? {
                'server.address': url.hostname,
                'server.port': url.port ? Number(url.port) : undefined,
                'url.scheme': url.protocol.replace(/:$/, ''),
                'url.path': url.pathname,
              }
            : {}),
        },
      });

      let nextCtx = ctx;
      if (propagate) {
        const carrier: Record<string, string> = {};
        propagation.inject(trace.setSpan(otelContext.active(), span), carrier);
        for (const [key, value] of Object.entries(carrier)) {
          nextCtx = withHeader(nextCtx, key, value);
        }
      }

      try {
        const res = await otelContext.with(trace.setSpan(otelContext.active(), span), () =>
          next(nextCtx),
        );
        span.setAttribute('http.response.status_code', res.response.status);
        if (res.response.status >= 400) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: `HTTP ${res.response.status}`,
          });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }
        return res;
      } catch (err) {
        if (err instanceof Error) {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          if ('name' in err && typeof err.name === 'string') {
            span.setAttribute('error.type', err.name);
          }
        } else {
          span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        }
        throw err;
      } finally {
        span.end();
      }
    },
    'outer',
  );
}

function safeParseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}
