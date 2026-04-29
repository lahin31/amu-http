import { createClient } from '@/client';
import type { HttpMethod } from '@/types/middleware';
import type { Client, ClientConfig, FetchImpl } from '@/types/public';

export interface RecordedRequest {
  readonly method: HttpMethod;
  /** Full URL (incl. base + query). */
  readonly url: string;
  /** Path portion only — what handlers match against. */
  readonly pathname: string;
  /** Parsed query string parameters. */
  readonly query: Readonly<Record<string, string>>;
  /** URL-template params extracted from the matched route. */
  readonly params: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string>>;
  /**
   * Body as parsed JSON when `content-type` is JSON, raw text for other types,
   * or `null` for empty bodies. amu serializes object bodies as JSON, so
   * `await client.post('/u', { a: 1 })` records `{ a: 1 }` here.
   */
  readonly body: unknown;
}

export interface MockResponse {
  readonly status?: number;
  readonly body?: unknown;
  readonly headers?: HeadersInit;
  readonly delay?: number;
}

export type MockHandler = (req: RecordedRequest) => MockResponse | Promise<MockResponse>;

export interface MockClient {
  /** A real `Client` whose fetch goes through the mock. */
  readonly client: Client;

  /**
   * Register a handler for a method + path template. Most recently registered
   * handler wins; pass `'*'` for the method to match any.
   */
  readonly on: (method: HttpMethod | '*', path: string, handler: MockHandler) => MockClient;

  /** Static-response shorthand. */
  readonly reply: {
    (method: HttpMethod | '*', path: string, body: unknown): MockClient;
    (
      method: HttpMethod | '*',
      path: string,
      status: number,
      body?: unknown,
      headers?: HeadersInit,
    ): MockClient;
  };

  /** Recorded requests (filtered by method/path-template if given). */
  readonly calls: (filter?: { method?: HttpMethod | '*'; path?: string }) => RecordedRequest[];

  /** Throws if no calls match. Optionally asserts a specific count. */
  readonly assertCalled: (method: HttpMethod | '*', path: string, times?: number) => void;

  /** Throws if any calls match. */
  readonly assertNotCalled: (method: HttpMethod | '*', path: string) => void;

  /** Clear handlers + recorded calls. */
  readonly reset: () => void;
}

/**
 * First-class mock client for tests. Replaces `vi.stubGlobal('fetch', ...)`.
 *
 * @example
 *   const mock = createMockClient({ baseURL: 'https://api.example.com' });
 *   mock.on('GET', '/users/:id', ({ params }) => ({ body: { id: params.id } }));
 *   const user = await mock.client.get('/users/:id', { params: { id: 1 } });
 *   mock.assertCalled('GET', '/users/:id', 1);
 */
export function createMockClient(config: ClientConfig = {}): MockClient {
  interface Route {
    readonly method: HttpMethod | '*';
    readonly path: string;
    readonly handler: MockHandler;
  }

  const routes: Route[] = [];
  const recorded: RecordedRequest[] = [];

  const fetchImpl: FetchImpl = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const parsed = new URL(url, 'http://__amu_mock__');
    const pathname = parsed.pathname;
    const query = Object.fromEntries(parsed.searchParams.entries());
    const method = (init?.method ?? 'GET').toUpperCase() as HttpMethod;
    const headers = init?.headers ? headersInitToObject(init.headers) : {};
    const body = await readBody(init?.body, headers);

    // Search routes in reverse-registration order so the most-recently
    // registered handler wins, matching the documented contract.
    for (let i = routes.length - 1; i >= 0; i--) {
      const route = routes[i];
      if (!route) continue;
      if (route.method !== '*' && route.method !== method) continue;
      const params = matchPath(route.path, pathname);
      if (!params) continue;

      const req: RecordedRequest = {
        method,
        url,
        pathname,
        query,
        params,
        headers,
        body,
      };
      recorded.push(req);
      const response = await route.handler(req);
      if (response.delay && response.delay > 0) {
        await new Promise((r) => setTimeout(r, response.delay));
      }
      return buildResponse(response);
    }

    // Unmatched: 404.
    recorded.push({
      method,
      url,
      pathname,
      query,
      params: {},
      headers,
      body,
    });
    return new Response(`Mock: no handler for ${method} ${pathname}`, { status: 404 });
  };

  const client = createClient({ ...config, fetch: fetchImpl });

  const matchesFilter = (
    req: RecordedRequest,
    filter: { method?: HttpMethod | '*'; path?: string } | undefined,
  ): boolean => {
    if (!filter) return true;
    if (filter.method && filter.method !== '*' && req.method !== filter.method) return false;
    if (filter.path && !matchPath(filter.path, req.pathname)) return false;
    return true;
  };

  const mock: MockClient = {
    client,
    on(method, path, handler) {
      routes.push({ method, path, handler });
      return mock;
    },
    reply(
      method: HttpMethod | '*',
      path: string,
      bodyOrStatus: unknown,
      maybeBody?: unknown,
      maybeHeaders?: HeadersInit,
    ): MockClient {
      const handler: MockHandler =
        typeof bodyOrStatus === 'number'
          ? () => ({ status: bodyOrStatus, body: maybeBody, headers: maybeHeaders })
          : () => ({ status: 200, body: bodyOrStatus });
      routes.push({ method, path, handler });
      return mock;
    },
    calls(filter) {
      return recorded.filter((req) => matchesFilter(req, filter));
    },
    assertCalled(method, path, times) {
      const matching = recorded.filter((req) => matchesFilter(req, { method, path }));
      if (matching.length === 0) {
        throw new Error(
          `Expected ${method} ${path} to be called, but no matching requests were recorded`,
        );
      }
      if (times !== undefined && matching.length !== times) {
        throw new Error(
          `Expected ${method} ${path} to be called ${times} time(s), but was called ${matching.length} time(s)`,
        );
      }
    },
    assertNotCalled(method, path) {
      const matching = recorded.filter((req) => matchesFilter(req, { method, path }));
      if (matching.length > 0) {
        throw new Error(
          `Expected ${method} ${path} not to be called, but it was called ${matching.length} time(s)`,
        );
      }
    },
    reset() {
      routes.length = 0;
      recorded.length = 0;
    },
  };

  return mock;
}

/**
 * Match a request pathname against a path template. Returns the param map on
 * success, `null` on no match. Same `:name` grammar as `client.get(...)`.
 *
 * Wildcards:
 *   - `*` (literally a single asterisk segment) matches any one segment
 *   - exact strings must match exactly
 */
function matchPath(template: string, pathname: string): Readonly<Record<string, string>> | null {
  const tParts = template.split('/').filter(Boolean);
  const pParts = pathname.split('/').filter(Boolean);
  if (tParts.length !== pParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < tParts.length; i++) {
    const t = tParts[i] ?? '';
    const p = pParts[i] ?? '';
    if (t.startsWith(':')) {
      params[t.slice(1)] = decodeURIComponent(p);
    } else if (t === '*') {
      // wildcard, no capture
    } else if (t !== p) {
      return null;
    }
  }
  return params;
}

function headersInitToObject(init: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init).forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

async function readBody(
  body: BodyInit | null | undefined,
  headers: Record<string, string>,
): Promise<unknown> {
  if (body === null || body === undefined) return null;
  let text: string;
  if (typeof body === 'string') text = body;
  else if (body instanceof Uint8Array) text = new TextDecoder().decode(body);
  else if (body instanceof URLSearchParams) text = body.toString();
  else return body; // FormData / Blob / ReadableStream — pass through

  const ct = headers['content-type'] ?? '';
  if (ct.includes('application/json')) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

function buildResponse(spec: MockResponse): Response {
  const status = spec.status ?? 200;
  const headers = new Headers(spec.headers);

  if (spec.body === undefined || spec.body === null) {
    return new Response(null, { status, headers });
  }
  if (typeof spec.body === 'string') {
    if (!headers.has('content-type')) headers.set('content-type', 'text/plain;charset=UTF-8');
    return new Response(spec.body, { status, headers });
  }
  // Default: JSON-serialize.
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(spec.body), { status, headers });
}
