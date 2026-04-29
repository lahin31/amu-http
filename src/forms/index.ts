/**
 * Type-safe builders for the two non-JSON body shapes amu's body serializer
 * recognises: `FormData` (multipart) and `URLSearchParams` (form-urlencoded).
 *
 * @example
 *   import { formData, urlEncoded } from 'amu-http/forms';
 *
 *   await client.post('/upload', formData({ file: blob, name: 'Ada' }));
 *   await client.post('/login', urlEncoded({ user: 'a', pass: 'b' }));
 */

/** Values that `FormData.set` / `append` accept. */
export type FormDataValue = string | number | boolean | Blob | File;

/** Build a `FormData` from a plain record. Arrays append multiple entries. */
export function formData(
  fields: Readonly<Record<string, FormDataValue | ReadonlyArray<FormDataValue> | null | undefined>>,
): FormData {
  const out = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        out.append(key, formValue(item));
      }
    } else {
      out.set(key, formValue(value as FormDataValue));
    }
  }
  return out;
}

/** Build a `URLSearchParams` (`application/x-www-form-urlencoded`). */
export function urlEncoded(
  fields: Readonly<
    Record<
      string,
      string | number | boolean | ReadonlyArray<string | number | boolean> | null | undefined
    >
  >,
): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        out.append(key, String(item));
      }
    } else {
      out.set(key, String(value));
    }
  }
  return out;
}

function formValue(v: FormDataValue): string | Blob {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  // Blob / File pass through untouched (FormData accepts both).
  return v;
}
