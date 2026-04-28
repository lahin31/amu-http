import { AmuUrlError } from '@/errors/AmuUrlError';
import { serializeQuery } from '@/query';
import type { QuerySerializer } from '@/types/public';

/** Detects `http:`/`https:` not followed by `//` — a common copy-paste typo. */
const MALFORMED_PROTOCOL = /^https?:[^/]/i;

/** A `:name` segment in a path template (alphanumeric + underscore). */
const PARAM_PATTERN = /:([A-Za-z0-9_]+)/g;

export function validateProtocolSlashes(url: string): void {
  if (!MALFORMED_PROTOCOL.test(url)) return;
  const suggestion = url.replace(/^([a-z]+:)(?!\/\/)/i, '$1//');
  throw new AmuUrlError(url, suggestion);
}

/**
 * Substitute `:name` placeholders in a path template with values from `params`.
 * Encoded via `encodeURIComponent`. Throws `AmuUrlError` if a required key is missing.
 */
export function interpolateParams(
  path: string,
  params: Readonly<Record<string, string | number>> | undefined,
): string {
  if (!path.includes(':')) return path;
  return path.replace(PARAM_PATTERN, (_, key: string) => {
    const value = params?.[key];
    if (value === undefined || value === null) {
      throw new AmuUrlError(path, `${path} (missing path parameter ":${key}")`);
    }
    return encodeURIComponent(String(value));
  });
}

/** Joins baseURL + path. Absolute paths take precedence. */
export function resolveUrl(path: string, baseURL: string | undefined): string {
  validateProtocolSlashes(path);
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (!baseURL) return path;
  if (baseURL.endsWith('/') && path.startsWith('/')) {
    return baseURL.slice(0, -1) + path;
  }
  if (!baseURL.endsWith('/') && !path.startsWith('/')) {
    return `${baseURL}/${path}`;
  }
  return baseURL + path;
}

/**
 * Append query params to a URL via the configured serializer (flat / qs / custom),
 * preserving any existing query string in the URL.
 */
export function appendQuery(
  url: string,
  query: Readonly<Record<string, unknown>> | undefined,
  serializer?: QuerySerializer,
): string {
  if (!query) return url;
  const serialized = serializeQuery(query, serializer);
  if (!serialized) return url;
  return url + (url.includes('?') ? '&' : '?') + serialized;
}

/** Build the final URL from path + path-params + base + query — single source of truth. */
export function buildUrl(args: {
  path: string;
  baseURL: string | undefined;
  params: Readonly<Record<string, string | number>> | undefined;
  query: Readonly<Record<string, unknown>> | undefined;
  serializer?: QuerySerializer;
}): string {
  const interpolated = interpolateParams(args.path, args.params);
  const resolved = resolveUrl(interpolated, args.baseURL);
  return appendQuery(resolved, args.query, args.serializer);
}
