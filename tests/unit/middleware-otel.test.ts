import { SpanStatusCode } from '@opentelemetry/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmuError, createClient } from '@/index';
import { otel } from '@/middleware/otel';

const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockReset());

const ok = () =>
  new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json' },
  });

interface RecordedSpan {
  name: string;
  attributes: Record<string, unknown>;
  status: { code: SpanStatusCode; message?: string };
  ended: boolean;
  exceptions: unknown[];
}

/**
 * A minimal Tracer suitable only for testing — records the span tree so we
 * can assert on lifecycle. Not a real SDK; we don't need one.
 */
function fakeTracer() {
  const spans: RecordedSpan[] = [];
  const tracer = {
    startSpan(name: string, options?: { attributes?: Record<string, unknown> }) {
      const initial: Record<string, unknown> = {};
      if (options?.attributes) {
        for (const [k, v] of Object.entries(options.attributes)) {
          if (v !== undefined) initial[k] = v;
        }
      }
      const rec: RecordedSpan = {
        name,
        attributes: initial,
        status: { code: SpanStatusCode.UNSET },
        ended: false,
        exceptions: [],
      };
      spans.push(rec);
      return {
        setAttribute(k: string, v: unknown) {
          if (v !== undefined) rec.attributes[k] = v;
        },
        setAttributes(a: Record<string, unknown>) {
          Object.assign(rec.attributes, a);
        },
        setStatus(s: RecordedSpan['status']) {
          rec.status = s;
        },
        recordException(e: unknown) {
          rec.exceptions.push(e);
        },
        end() {
          rec.ended = true;
        },
        spanContext: () => ({ traceId: 'abc', spanId: 'def', traceFlags: 1 }),
      };
    },
  } as unknown as Parameters<typeof otel>[0] extends infer O
    ? O extends { tracer?: infer T }
      ? NonNullable<T>
      : never
    : never;
  return { tracer, spans };
}

describe('otel middleware', () => {
  it('starts a span and ends it on success', async () => {
    fetchMock.mockImplementation(async () => ok());
    const { tracer, spans } = fakeTracer();
    const api = createClient({ middleware: [otel({ tracer, propagate: false })] });

    await api.get('https://api.example.com/users/1');

    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe('HTTP GET');
    expect(spans[0]?.ended).toBe(true);
    expect(spans[0]?.attributes['http.request.method']).toBe('GET');
    expect(spans[0]?.attributes['url.full']).toBe('https://api.example.com/users/1');
    expect(spans[0]?.attributes['server.address']).toBe('api.example.com');
    expect(spans[0]?.attributes['url.path']).toBe('/users/1');
    expect(spans[0]?.attributes['http.response.status_code']).toBe(200);
    expect(spans[0]?.status.code).toBe(SpanStatusCode.OK);
  });

  it('marks span ERROR with status code on AmuError', async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ msg: 'boom' }), { status: 500 }),
    );
    const { tracer, spans } = fakeTracer();
    const api = createClient({ middleware: [otel({ tracer, propagate: false })] });

    await expect(api.get('https://x/oops')).rejects.toBeInstanceOf(AmuError);

    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0]?.status.message).toContain('500');
    expect(spans[0]?.ended).toBe(true);
    expect(spans[0]?.attributes['error.type']).toBe('AmuError');
    expect(spans[0]?.exceptions).toHaveLength(1);
  });

  it('marks span ERROR on transport failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const { tracer, spans } = fakeTracer();
    const api = createClient({ middleware: [otel({ tracer, propagate: false })] });

    await expect(api.get('https://x/dead')).rejects.toMatchObject({
      name: 'AmuNetworkError',
    });

    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0]?.attributes['error.type']).toBe('AmuNetworkError');
    expect(spans[0]?.ended).toBe(true);
  });

  it('uses a custom spanName when provided', async () => {
    fetchMock.mockImplementation(async () => ok());
    const { tracer, spans } = fakeTracer();
    const api = createClient({
      middleware: [
        otel({
          tracer,
          propagate: false,
          spanName: ({ method, url }) => `→ ${method} ${new URL(url).pathname}`,
        }),
      ],
    });

    await api.get('https://x/users/42');
    expect(spans[0]?.name).toBe('→ GET /users/42');
  });

  // Note: traceparent injection requires an active OTel context with a real
  // propagator registered (e.g. @opentelemetry/core's W3CTraceContextPropagator).
  // That's testing OTel itself; we trust the spec implementation.
});
