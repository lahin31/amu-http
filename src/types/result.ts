import type { AmuError } from '@/errors/AmuError';
import type { AmuNetworkError } from '@/errors/AmuNetworkError';
import type { AmuUnknownError } from '@/errors/AmuUnknownError';
import type { AmuUrlError } from '@/errors/AmuUrlError';
import type { AmuValidationError } from '@/errors/AmuValidationError';

/**
 * The complete amu error union — exhaustively narrowable.
 *
 *   - AmuError           HTTP non-2xx response
 *   - AmuNetworkError    transport failure (8 kinds)
 *   - AmuUrlError        malformed URL caught before request
 *   - AmuValidationError schema validation failed (request body OR response data)
 *   - AmuUnknownError    catch-all for non-amu errors thrown by middleware (programming bugs)
 */
export type AmuAnyError =
  | AmuError
  | AmuNetworkError
  | AmuUrlError
  | AmuValidationError
  | AmuUnknownError;

/**
 * Tagged union returned by `client.safe.*` methods.
 *
 * @example
 *   const r = await client.safe.get('/u', { schema: { response: User } });
 *   if (r.ok) {
 *     r.data; // ^? z.infer<typeof User>
 *   } else {
 *     switch (r.error.name) {
 *       case 'AmuError':            // HTTP error — narrow `error.status`
 *       case 'AmuNetworkError':     // transport — narrow further by `error.kind`
 *       case 'AmuUrlError':         // bad URL
 *       case 'AmuValidationError':  // bad shape
 *       case 'AmuUnknownError':     // bug
 *     }
 *   }
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: AmuAnyError };
