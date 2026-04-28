import { AmuError } from '@/errors/AmuError';
import { defineMiddleware, type Middleware } from '@/types/middleware';

/**
 * Streaming chain's analogue of `parse`: throws `AmuError` on non-2xx
 * (consuming the error body) but leaves a successful response's body
 * untouched so the caller can read it as a stream.
 */
export const parseOnError: Middleware = defineMiddleware(
  'parseOnError',
  async (ctx, next) => {
    const res = await next(ctx);
    if (!res.response.ok) {
      const data = await readErrorBody(res.response);
      throw new AmuError(res.response.status, res.response.statusText, data, res.response.headers);
    }
    return res;
  },
  'inner',
);

async function readErrorBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return null;
  const contentType = response.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) return await response.json();
    return await response.text();
  } catch {
    return null;
  }
}
