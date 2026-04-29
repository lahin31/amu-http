/**
 * Serialize a request body to a `BodyInit`. Non-JSON types (FormData,
 * URLSearchParams, Blob, ArrayBuffer, ReadableStream, string) are passed
 * through; any other shape is JSON-encoded.
 *
 * Sets a sensible default `Content-Type` only when the caller hasn't
 * specified one explicitly.
 */
export function serializeBody(body: unknown, headers: Headers): BodyInit | null {
  if (body === null || body === undefined) return null;

  if (typeof body === 'string') {
    if (!headers.has('content-type')) headers.set('content-type', 'text/plain;charset=UTF-8');
    return body;
  }

  // ReadableStream — streamed upload. Don't set content-type by default;
  // the caller usually knows what they're sending (e.g. application/octet-stream).
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    return body;
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    if (!headers.has('content-type') && body.type) headers.set('content-type', body.type);
    return body;
  }

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    // Don't set content-type — fetch will set the correct multipart boundary.
    return body;
  }

  if (body instanceof URLSearchParams) {
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
    }
    return body;
  }

  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return body as BodyInit;
  }

  // Fallback: JSON.
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return JSON.stringify(body);
}
