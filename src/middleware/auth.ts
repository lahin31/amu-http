import { AmuError } from '@/errors/AmuError';
import { withHeader } from '@/request';
import { defineMiddleware, type Middleware } from '@/types/middleware';

/**
 * A token source. Either a static string or a function that produces one
 * (sync or async). Returning `null` / `undefined` skips the header — useful
 * for "logged-out" state.
 */
export type TokenSource =
  | string
  | (() => string | null | undefined | Promise<string | null | undefined>);

/**
 * Inject `Authorization: Bearer <token>` on every request.
 * Token is resolved per-request, so token rotation is observed automatically.
 */
export function bearerAuth(token: TokenSource): Middleware {
  return defineMiddleware(
    'bearerAuth',
    async (ctx, next) => {
      const value = typeof token === 'function' ? await token() : token;
      if (!value) return next(ctx);
      return next(withHeader(ctx, 'authorization', `Bearer ${value}`));
    },
    'middle',
  );
}

/**
 * Inject HTTP Basic auth (`Authorization: Basic <base64(user:pass)>`).
 * Credentials are resolved per-request.
 */
export type BasicCredentials = { username: string; password: string };
export type BasicCredentialsSource =
  | BasicCredentials
  | (() => BasicCredentials | null | undefined | Promise<BasicCredentials | null | undefined>);

export function basicAuth(creds: BasicCredentialsSource): Middleware {
  return defineMiddleware(
    'basicAuth',
    async (ctx, next) => {
      const resolved = typeof creds === 'function' ? await creds() : creds;
      if (!resolved) return next(ctx);
      const encoded = encodeBase64(`${resolved.username}:${resolved.password}`);
      return next(withHeader(ctx, 'authorization', `Basic ${encoded}`));
    },
    'middle',
  );
}

function encodeBase64(input: string): string {
  // Node 20+, browsers, edge runtimes all expose `btoa` globally.
  // For non-ASCII characters btoa needs the input to be a binary string,
  // so encode via TextEncoder first.
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Refresh + retry on 401. Concurrent refreshes are de-duped via a shared
 * in-flight Promise, so 50 simultaneous 401s trigger one refresh, not 50.
 *
 * The `refresh` function is responsible for whatever side-effect updates the
 * token source consumed by `bearerAuth` (e.g. writing to an auth store).
 * This middleware does not manage tokens itself — it only orchestrates retry.
 *
 * Recommended placement: outermost, before `bearerAuth`, so the retry path
 * re-enters `bearerAuth` and picks up the freshly stored token.
 *
 * @example
 *   middleware: [
 *     refreshOn401({ refresh: () => authStore.refresh() }),
 *     bearerAuth(() => authStore.token),
 *   ]
 */
export function refreshOn401(opts: {
  readonly refresh: () => Promise<unknown>;
  readonly shouldRefresh?: (err: AmuError) => boolean;
}): Middleware {
  let inflight: Promise<unknown> | null = null;

  const ensureRefresh = (): Promise<unknown> => {
    if (!inflight) {
      inflight = Promise.resolve()
        .then(() => opts.refresh())
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  };

  const shouldRefresh = opts.shouldRefresh ?? ((err: AmuError) => err.status === 401);

  return defineMiddleware(
    'refreshOn401',
    async (ctx, next) => {
      try {
        return await next(ctx);
      } catch (err) {
        if (err instanceof AmuError && shouldRefresh(err)) {
          await ensureRefresh();
          return next(ctx);
        }
        throw err;
      }
    },
    'outer',
  );
}
