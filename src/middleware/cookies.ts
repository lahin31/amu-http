/**
 * Cookie-jar middleware (zero dependencies).
 *
 * Reads `Set-Cookie` from responses, stores cookies in a jar, and adds the
 * matching `Cookie` header to subsequent requests for the same origin.
 *
 * Implements a useful subset of RFC 6265: name/value, Domain, Path, Expires,
 * Max-Age, Secure, HttpOnly, SameSite. Domain matching follows the standard
 * "exact OR proper subdomain" rule. Path matching is the default-path
 * algorithm from §5.1.4.
 *
 * Caveats vs `tough-cookie`:
 *   - No public-suffix-list awareness (a cookie set by `evil.com` for
 *     `Domain=com` will be stored — same as fetch in browsers, but tough-cookie
 *     would reject this).
 *   - No serialization to disk by default; `Jar` is in-memory.
 *
 * Use a real cookie library if you need PSL or persistence; this middleware
 * is intended for server-to-server flows that need session continuity.
 */

import { withHeader } from '@/request';
import { defineMiddleware, type Middleware } from '@/types/middleware';

export interface Cookie {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: string;
  readonly expires?: Date;
  readonly secure: boolean;
  readonly httpOnly: boolean;
  readonly sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface CookieJar {
  set(cookie: Cookie): void;
  setFromResponse(url: URL, setCookieValues: ReadonlyArray<string>): void;
  getMatching(url: URL): Cookie[];
  toHeader(url: URL): string;
  clear(): void;
  /** Snapshot — useful for tests / persistence. */
  all(): Cookie[];
}

/** Create an in-memory cookie jar. */
export function createCookieJar(): CookieJar {
  const cookies: Cookie[] = [];

  const purgeExpired = () => {
    const now = Date.now();
    for (let i = cookies.length - 1; i >= 0; i--) {
      if (cookies[i]?.expires && cookies[i]!.expires!.getTime() <= now) {
        cookies.splice(i, 1);
      }
    }
  };

  return {
    set(cookie) {
      // Replace any existing cookie with the same (name, domain, path) tuple.
      const idx = cookies.findIndex(
        (c) => c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path,
      );
      if (idx >= 0) cookies.splice(idx, 1);
      cookies.push(cookie);
    },
    setFromResponse(url, values) {
      for (const value of values) {
        const parsed = parseSetCookie(value, url);
        if (parsed) this.set(parsed);
      }
    },
    getMatching(url) {
      purgeExpired();
      return cookies.filter((c) => matches(c, url));
    },
    toHeader(url) {
      return this.getMatching(url)
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');
    },
    clear() {
      cookies.length = 0;
    },
    all() {
      purgeExpired();
      return [...cookies];
    },
  };
}

/**
 * Cookie-jar middleware.
 *
 * @example
 *   import { cookies, createCookieJar } from 'amu-http/middleware/cookies';
 *
 *   const jar = createCookieJar();
 *   const api = createClient({ middleware: [cookies({ jar })] });
 *
 *   await api.post('/login', creds);   // server sets session cookie
 *   await api.get('/profile');         // amu attaches the cookie automatically
 */
export function cookies(options: { jar?: CookieJar } = {}): Middleware {
  const jar = options.jar ?? createCookieJar();

  return defineMiddleware(
    'cookies',
    async (ctx, next) => {
      const url = safeParseUrl(ctx.url);

      let nextCtx = ctx;
      if (url) {
        const header = jar.toHeader(url);
        if (header) {
          // Merge with any existing Cookie header set by the caller.
          const existing = ctx.headers.get('cookie');
          nextCtx = withHeader(ctx, 'cookie', existing ? `${existing}; ${header}` : header);
        }
      }

      const res = await next(nextCtx);

      if (url) {
        const setCookies = readSetCookieAll(res.response.headers);
        if (setCookies.length > 0) jar.setFromResponse(url, setCookies);
      }

      return res;
    },
    'middle',
  );
}

// ─── parsing / matching ────────────────────────────────────────────────────────

function safeParseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

/**
 * Read every Set-Cookie value from a Headers object. Modern runtimes expose
 * `Headers.getSetCookie()`; we fall back to scanning entries for older shims.
 */
function readSetCookieAll(headers: Headers): string[] {
  const h = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === 'function') return h.getSetCookie();
  // Fallback — some implementations join multiple Set-Cookie with comma; that's
  // ambiguous with date fields. Best-effort split using a comma followed by a
  // SP and a token-char.
  const raw = headers.get('set-cookie');
  if (!raw) return [];
  return raw.split(/,(?=\s*[A-Za-z0-9!#$%&'*+\-.^_`|~]+=)/);
}

function parseSetCookie(value: string, requestUrl: URL): Cookie | null {
  const parts = value.split(';').map((s) => s.trim());
  const head = parts.shift();
  if (!head) return null;
  const eq = head.indexOf('=');
  if (eq <= 0) return null;
  const name = head.slice(0, eq).trim();
  const cookieValue = head.slice(eq + 1).trim();

  let domain = requestUrl.hostname.toLowerCase();
  let path = defaultPath(requestUrl.pathname);
  let expires: Date | undefined;
  let maxAge: number | undefined;
  let secure = false;
  let httpOnly = false;
  let sameSite: Cookie['sameSite'];

  for (const attr of parts) {
    const idx = attr.indexOf('=');
    const k = (idx === -1 ? attr : attr.slice(0, idx)).toLowerCase();
    const v = idx === -1 ? '' : attr.slice(idx + 1);
    switch (k) {
      case 'domain':
        domain = v.toLowerCase().replace(/^\./, '');
        break;
      case 'path':
        if (v.startsWith('/')) path = v;
        break;
      case 'expires': {
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) expires = d;
        break;
      }
      case 'max-age': {
        const n = Number(v);
        if (Number.isFinite(n)) maxAge = n;
        break;
      }
      case 'secure':
        secure = true;
        break;
      case 'httponly':
        httpOnly = true;
        break;
      case 'samesite':
        if (v === 'Strict' || v === 'Lax' || v === 'None') sameSite = v;
        break;
    }
  }

  if (maxAge !== undefined) expires = new Date(Date.now() + maxAge * 1000);

  return { name, value: cookieValue, domain, path, expires, secure, httpOnly, sameSite };
}

/** Default-path algorithm from RFC 6265 §5.1.4. */
function defaultPath(path: string): string {
  if (!path || !path.startsWith('/')) return '/';
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash <= 0) return '/';
  return path.slice(0, lastSlash);
}

function matches(cookie: Cookie, url: URL): boolean {
  // Expiration
  if (cookie.expires && cookie.expires.getTime() <= Date.now()) return false;
  // Secure: only over HTTPS
  if (cookie.secure && url.protocol !== 'https:') return false;
  // Domain match: exact or proper subdomain
  const host = url.hostname.toLowerCase();
  if (host !== cookie.domain && !host.endsWith(`.${cookie.domain}`)) return false;
  // Path match: cookie path is a prefix of request path
  return pathMatches(cookie.path, url.pathname);
}

function pathMatches(cookiePath: string, requestPath: string): boolean {
  if (cookiePath === requestPath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  if (cookiePath.endsWith('/')) return true;
  return requestPath.charAt(cookiePath.length) === '/';
}
