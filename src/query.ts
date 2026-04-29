import type { QuerySerializer } from '@/types/public';

/**
 * Run the configured serializer on a query object. `null` / `undefined`
 * values are dropped (they're "absent", not "explicitly empty").
 */
export function serializeQuery(
  query: Readonly<Record<string, unknown>>,
  serializer: QuerySerializer | undefined,
): string {
  if (typeof serializer === 'function') return serializer(query);
  if (serializer === 'qs') return serializeQs(query);
  return serializeFlat(query);
}

/**
 * Default serializer.
 *
 *   { a: 1, b: 'two', c: [1, 2] } → a=1&b=two&c=1,2
 *
 * Arrays are joined with `,` (the most common REST convention; `Repeat` /
 * bracket forms can be expressed via the custom function form).
 */
function serializeFlat(query: Readonly<Record<string, unknown>>): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      out.set(
        key,
        value
          .filter((v) => v !== undefined && v !== null)
          .map(String)
          .join(','),
      );
    } else {
      out.set(key, String(value));
    }
  }
  return out.toString();
}

/**
 * `qs`-style bracketed nested syntax. Handles arbitrary nesting depth.
 *
 *   { filter: { status: 'a', date: { gt: '2024-01-01' } } }
 *     → filter[status]=a&filter[date][gt]=2024-01-01
 *   { tags: ['a', 'b'] }
 *     → tags[]=a&tags[]=b
 */
function serializeQs(query: Readonly<Record<string, unknown>>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    walk(parts, key, value);
  }
  return parts.join('&');
}

function walk(out: string[], key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) walk(out, `${key}[]`, item);
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walk(out, `${key}[${k}]`, v);
    }
    return;
  }
  out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
}
