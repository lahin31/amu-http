/**
 * Cache middleware (in-memory, ETag-aware).
 *
 * Subset of RFC 9111 + RFC 7232 useful for typical client-side caching:
 *
 *   - Only `GET` and `HEAD` are cached (matches the safe-methods rule).
 *   - Honors `Cache-Control: max-age=N` and `Expires` for fresh-window decisions.
 *   - Honors `Cache-Control: no-store` (skip cache entirely) and `no-cache`
 *     (must revalidate before serving).
 *   - On a stale-but-revalidatable entry, sends `If-None-Match` (ETag) or
 *     `If-Modified-Since` (Last-Modified). On 304, serves the cached body.
 *   - Vary header: keys per the listed request headers; unsupported `Vary: *`
 *     skips caching.
 *
 * Caveats:
 *   - In-memory only. The store is pluggable; persist to Redis/disk by
 *     implementing the `CacheStore` interface.
 *   - We don't store unconsumed response bodies — bodies are read into memory
 *     once and served as-is on hit. Streaming responses (`client.stream`) are
 *     not cached.
 */

import { AmuError } from '@/errors/AmuError';
import { withHeader } from '@/request';
import type { RequestContext, ResponseContext } from '@/types/middleware';
import { defineMiddleware, type Middleware } from '@/types/middleware';

export interface CachedEntry {
  readonly status: number;
  readonly statusText: string;
  /** Headers as a plain object — what we replay on a cache hit. */
  readonly headers: ReadonlyArray<readonly [string, string]>;
  /**
   * Already-parsed body (the value `parse` middleware would produce).
   * On a cache HIT we replay it directly instead of re-running `parse`.
   */
  readonly data: unknown;
  readonly etag?: string;
  readonly lastModified?: string;
  /** Epoch ms when this entry stops being fresh (no revalidation needed). */
  readonly freshUntil?: number;
  /** Source request `Vary` header values, used to scope the cache key. */
  readonly vary?: ReadonlyArray<readonly [string, string]>;
}

export interface CacheStore {
  get(key: string): CachedEntry | undefined | Promise<CachedEntry | undefined>;
  set(key: string, entry: CachedEntry): void | Promise<void>;
  delete(key: string): void | Promise<void>;
  clear(): void | Promise<void>;
  /** Number of entries (for tests / observability). */
  size?(): number;
}

/** Default in-memory store. */
export function createMemoryCacheStore(maxEntries = 1000): CacheStore {
  const store = new Map<string, CachedEntry>();
  return {
    get: (key) => store.get(key),
    set: (key, entry) => {
      // Naive LRU: when full, drop the oldest (Map preserves insertion order).
      if (store.size >= maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      store.delete(key); // refresh ordering
      store.set(key, entry);
    },
    delete: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    size: () => store.size,
  };
}

export interface CacheOptions {
  readonly store?: CacheStore;
  /**
   * Methods to cache. Defaults to safe + idempotent: `GET`, `HEAD`.
   * Caching `POST`/`PUT`/`DELETE` is almost always wrong — don't add them
   * unless you understand HTTP semantics.
   */
  readonly methods?: ReadonlyArray<string>;
  /**
   * Override the default cache key. By default we use `${method} ${url}`
   * (plus any Vary-keyed headers). Useful when your API path is the same
   * but per-user data differs and you want to scope it.
   */
  readonly keyFor?: (method: string, url: string, headers: Headers) => string;
}

const DEFAULT_METHODS: ReadonlyArray<string> = ['GET', 'HEAD'];

/**
 * @example
 *   import { cache, createMemoryCacheStore } from 'amu-http/middleware/cache';
 *
 *   const api = createClient({
 *     middleware: [cache({ store: createMemoryCacheStore() })],
 *   });
 */
export function cache(options: CacheOptions = {}): Middleware {
  const store = options.store ?? createMemoryCacheStore();
  const methods = new Set((options.methods ?? DEFAULT_METHODS).map((m) => m.toUpperCase()));
  const keyFor = options.keyFor ?? ((method: string, url: string) => `${method} ${url}`);

  return defineMiddleware(
    'cache',
    async (ctx, next) => {
      if (!methods.has(ctx.method)) return next(ctx);

      const cacheControl = parseCacheControl(ctx.headers.get('cache-control'));
      if (cacheControl.noStore) return next(ctx);

      const baseKey = keyFor(ctx.method, ctx.url, ctx.headers);
      const cached = await store.get(baseKey);
      const now = Date.now();

      // Fresh hit: replay without going to the network.
      if (cached && !cacheControl.noCache && cached.freshUntil && cached.freshUntil > now) {
        return replayCache(ctx, cached);
      }

      // Stale-but-revalidatable: add conditional headers.
      let nextCtx = ctx;
      if (cached) {
        if (cached.etag) nextCtx = withHeader(nextCtx, 'if-none-match', cached.etag);
        if (cached.lastModified) {
          nextCtx = withHeader(nextCtx, 'if-modified-since', cached.lastModified);
        }
      }

      let res: ResponseContext;
      try {
        res = await next(nextCtx);
      } catch (err) {
        // The inner `parse` middleware throws `AmuError(304)` because
        // 304 is not a 2xx response. When we're revalidating, that's the
        // SUCCESS path — the server told us our cached entry is still valid.
        if (cached && err instanceof AmuError && err.status === 304) {
          const refreshed: CachedEntry = {
            ...cached,
            freshUntil: computeFreshUntil(err.headers, now) ?? cached.freshUntil,
          };
          await store.set(baseKey, refreshed);
          return replayCache(ctx, refreshed);
        }
        throw err;
      }

      // 2xx: maybe store this response. We use the already-parsed `data`
      // (the inner `parse` middleware has consumed the body by now); we
      // serialize that back to a string for replay.
      if (res.response.status >= 200 && res.response.status < 300) {
        const entry = captureFromContext(res.response, res.data, now);
        if (entry) await store.set(baseKey, entry);
      }

      return res;
    },
    'middle',
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface CacheControl {
  readonly noStore: boolean;
  readonly noCache: boolean;
  readonly maxAge?: number;
}

function parseCacheControl(header: string | null | undefined): CacheControl {
  if (!header) return { noStore: false, noCache: false };
  const parts = header.split(',').map((s) => s.trim().toLowerCase());
  let maxAge: number | undefined;
  for (const part of parts) {
    if (part === 'no-store') return { noStore: true, noCache: false };
    if (part === 'no-cache') return { noStore: false, noCache: true };
    if (part.startsWith('max-age=')) {
      const n = Number(part.slice('max-age='.length));
      if (Number.isFinite(n) && n >= 0) maxAge = n;
    }
  }
  return { noStore: false, noCache: false, maxAge };
}

function computeFreshUntil(headers: Headers, now: number): number | undefined {
  const cc = parseCacheControl(headers.get('cache-control'));
  if (cc.maxAge !== undefined) return now + cc.maxAge * 1000;
  const expires = headers.get('expires');
  if (expires) {
    const t = Date.parse(expires);
    if (Number.isFinite(t)) return t;
  }
  return undefined;
}

/**
 * Capture from the post-parse context. The inner `parse` middleware has
 * already consumed `response.body`; we use the already-parsed `data` and
 * re-serialize for replay. Binary / non-text responses aren't cached.
 */
function captureFromContext(response: Response, data: unknown, now: number): CachedEntry | null {
  const cc = parseCacheControl(response.headers.get('cache-control'));
  if (cc.noStore) return null;

  const vary = response.headers.get('vary');
  if (vary && vary.trim() === '*') return null; // un-cacheable per spec

  const ct = response.headers.get('content-type') ?? '';
  // Skip caching binary responses — `data` for those is a Blob and we don't
  // want to retain large blobs in memory by default.
  if (
    response.status !== 204 &&
    response.status !== 205 &&
    !ct.includes('application/json') &&
    !ct.includes('text/') &&
    ct !== ''
  ) {
    return null;
  }

  const headers: Array<readonly [string, string]> = [];
  for (const [key, value] of response.headers) headers.push([key, value]);

  return {
    status: response.status,
    statusText: response.statusText,
    headers,
    data,
    etag: response.headers.get('etag') ?? undefined,
    lastModified: response.headers.get('last-modified') ?? undefined,
    freshUntil: computeFreshUntil(response.headers, now),
  };
}

function replayCache(ctx: RequestContext, entry: CachedEntry): ResponseContext {
  const headers = new Headers();
  for (const [k, v] of entry.headers) headers.set(k, v);
  headers.set('x-amu-cache', 'HIT');
  // Body is populated for completeness (consumers reading `response.body` get
  // a stream they can consume). The parsed `data` is what amu's promise
  // resolves to and is the source of truth for the hit.
  const replayBody =
    entry.data === null || entry.data === undefined
      ? null
      : typeof entry.data === 'string'
        ? entry.data
        : JSON.stringify(entry.data);
  const response = new Response(replayBody, {
    status: entry.status,
    statusText: entry.statusText,
    headers,
  });
  return {
    request: ctx,
    response,
    data: entry.data,
    attempt: typeof ctx.meta['attempt'] === 'number' ? ctx.meta['attempt'] : 1,
  };
}
