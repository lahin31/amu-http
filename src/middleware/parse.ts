import { AmuError } from '@/errors/AmuError';
import { defineMiddleware, type Middleware } from '@/types/middleware';

/**
 * Parse the response body once and decide HTTP success vs failure.
 *
 *   - Reads body (JSON if `application/json`, otherwise text). 204 → null.
 *   - On non-2xx: throws `AmuError` carrying the parsed body and headers.
 *   - On success: returns the response context with `data` populated.
 *
 * This is one of the few "core" middleware that must run for the throw-on-error
 * contract to hold. `client.ts` always installs it as the inner-most layer.
 */
export const parse: Middleware = defineMiddleware(
  'parse',
  async (ctx, next) => {
    const res = await next(ctx);
    const data = await readBody(res.response);
    if (!res.response.ok) {
      throw new AmuError(res.response.status, res.response.statusText, data, res.response.headers);
    }
    return { ...res, data };
  },
  'inner',
);

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return null;
  // `Response.json()` consumes the body; we only read it once here.
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return await response.json();
  }
  if (contentType.includes('text/') || contentType === '') {
    return await response.text();
  }
  return await response.blob();
}
