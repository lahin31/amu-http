import { serializeBody } from '@/body';
import { AmuError } from '@/errors/AmuError';
import { AmuNetworkError } from '@/errors/AmuNetworkError';
import { AmuUnknownError } from '@/errors/AmuUnknownError';
import { AmuUrlError } from '@/errors/AmuUrlError';
import { AmuValidationError } from '@/errors/AmuValidationError';
import { parse } from '@/middleware/parse';
import { parseOnError } from '@/middleware/parseOnError';
import { retry } from '@/middleware/retry';
import { timeout } from '@/middleware/timeout';
import { validate, validateSchema } from '@/middleware/validate';
import { composeMiddleware, createContext, createTerminal } from '@/request';
import type { HttpMethod, ResponseContext } from '@/types/middleware';
import type { Client, ClientConfig, RequestOptions, RequestSchema, Schema } from '@/types/public';
import type { AmuAnyError, Result } from '@/types/result';
import { buildUrl } from '@/url';

/**
 * Create a typed HTTP client. The returned object is frozen — every method
 * is a bound function over closure state. No class.
 *
 * @example
 *   const api = createClient({
 *     baseURL: 'https://api.example.com',
 *     middleware: [bearerAuth(getToken)],
 *   })
 *   const user = await api.get('/users/:id', {
 *     params: { id: 1 },
 *     schema: { response: User },
 *   })
 */
export function createClient(config: ClientConfig = {}): Client {
  const {
    baseURL,
    headers: defaultHeaders,
    fetch: fetchImpl,
    middleware: userMiddleware = [],
  } = config;

  const fetcher = fetchImpl ?? globalThis.fetch.bind(globalThis);
  const terminal = createTerminal(fetcher);

  // Composition order matters: user middleware sits OUTSIDE built-ins, so:
  //   - logger / telemetry sees the full request lifecycle (incl. retries)
  //   - refreshOn401 catches AmuError thrown by `parse` on 401
  //   - bearerAuth injects the latest token on each retry attempt
  // Recommended user order (outer → inner):
  //   [logger, requestId, refreshOn401, bearerAuth, ...other auth/telemetry]
  const jsonBuiltins = [retry(config.retries), timeout(config.timeout ?? 10_000), validate, parse];
  const streamBuiltins = [retry(config.retries), timeout(config.timeout ?? 10_000), parseOnError];
  const jsonChain = composeMiddleware([...userMiddleware, ...jsonBuiltins], terminal);
  const streamChain = composeMiddleware([...userMiddleware, ...streamBuiltins], terminal);

  async function execute(args: {
    path: string;
    method: HttpMethod;
    body: unknown;
    options: RequestOptions | undefined;
  }): Promise<unknown> {
    const ctx = await buildContextAsync(args, /* isStream */ false);
    const result: ResponseContext = await jsonChain(ctx);
    return result.data;
  }

  async function executeStream(args: {
    path: string;
    method: HttpMethod;
    body: unknown;
    options: RequestOptions | undefined;
  }): Promise<Response> {
    const ctx = await buildContextAsync(args, /* isStream */ true);
    const result: ResponseContext = await streamChain(ctx);
    return result.response;
  }

  async function buildContextAsync(
    args: {
      path: string;
      method: HttpMethod;
      body: unknown;
      options: RequestOptions | undefined;
    },
    isStream: boolean,
  ) {
    const opts = args.options ?? {};
    const params = (opts as RequestOptions & { params?: Record<string, string | number> }).params;

    const url = buildUrl({
      path: args.path,
      baseURL,
      params,
      query: opts.query,
    });

    const headers = mergeHeaders(defaultHeaders, opts.headers);

    let body: BodyInit | null = null;
    if (args.body !== undefined && args.body !== null) {
      const validated = await validateRequestBody(args.body, opts.schema);
      body = serializeBody(validated, headers);
    }

    return createContext({
      url,
      method: args.method,
      headers,
      body,
      signal: opts.signal ?? new AbortController().signal,
      meta: {
        ...opts.meta,
        responseSchema: isStream ? undefined : opts.schema?.response,
        retries: opts.retries,
        timeout: opts.timeout,
      },
    });
  }

  function makeBodyless(method: HttpMethod) {
    return (path: string, options?: RequestOptions): Promise<unknown> =>
      execute({ path, method, body: undefined, options });
  }

  function makeBody(method: HttpMethod) {
    return (path: string, body: unknown, options?: RequestOptions): Promise<unknown> =>
      execute({ path, method, body, options });
  }

  const get = makeBodyless('GET');
  const del = makeBodyless('DELETE');
  const head = makeBodyless('HEAD');
  const options = makeBodyless('OPTIONS');
  const post = makeBody('POST');
  const put = makeBody('PUT');
  const patch = makeBody('PATCH');

  /** Returns the raw `ReadableStream<Uint8Array>` for the response body. */
  async function stream(
    path: string,
    options?: RequestOptions & { method?: HttpMethod },
  ): Promise<ReadableStream<Uint8Array>> {
    const response = await executeStream({
      path,
      method: options?.method ?? 'GET',
      body: undefined,
      options,
    });
    if (!response.body) {
      // Synthesize an empty stream so the caller's `for await` is well-defined.
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
    }
    return response.body;
  }

  const safe = Object.freeze({
    get: wrapSafeBodyless(get),
    delete: wrapSafeBodyless(del),
    head: wrapSafeBodyless(head),
    options: wrapSafeBodyless(options),
    post: wrapSafeBody(post),
    put: wrapSafeBody(put),
    patch: wrapSafeBody(patch),
  });

  // Cast at the public boundary — internally everything is `unknown`, the type
  // signatures in `Client` express the inferred narrowing for callers.
  return Object.freeze({
    get,
    delete: del,
    head,
    options,
    post,
    put,
    patch,
    stream,
    safe,
  }) as unknown as Client;
}

/**
 * Single safe-wrapper used to build `client.safe.*`. Catches every thrown
 * value, normalizes non-amu errors to `AmuUnknownError`, and returns a
 * `Result<T>` discriminated union.
 */
async function toSafeResult<T>(p: Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await p };
  } catch (err) {
    return { ok: false, error: normalizeError(err) };
  }
}

function wrapSafeBodyless(fn: (path: string, options?: RequestOptions) => Promise<unknown>) {
  return (path: string, options?: RequestOptions) => toSafeResult(fn(path, options));
}

function wrapSafeBody(
  fn: (path: string, body: unknown, options?: RequestOptions) => Promise<unknown>,
) {
  return (path: string, body: unknown, options?: RequestOptions) =>
    toSafeResult(fn(path, body, options));
}

function normalizeError(err: unknown): AmuAnyError {
  if (
    err instanceof AmuError ||
    err instanceof AmuNetworkError ||
    err instanceof AmuUrlError ||
    err instanceof AmuValidationError ||
    err instanceof AmuUnknownError
  ) {
    return err;
  }
  return new AmuUnknownError(err);
}

function mergeHeaders(...sources: ReadonlyArray<HeadersInit | undefined>): Headers {
  const headers = new Headers();
  for (const src of sources) {
    if (!src) continue;
    for (const [key, value] of new Headers(src)) {
      headers.set(key, value);
    }
  }
  return headers;
}

async function validateRequestBody(
  body: unknown,
  schema: RequestSchema | undefined,
): Promise<unknown> {
  if (!schema?.body) return body;
  const result = await validateSchema(schema.body as Schema<unknown>, body);
  if (!result.ok) {
    throw new AmuValidationError(
      'request',
      'Request body failed schema validation',
      body,
      result.issues,
    );
  }
  return result.value;
}

/** Default client with no baseURL — `await amu.get(absoluteUrl)` works out of the box. */
export const amu: Client = createClient();
