import { AmuValidationError } from '@/errors/AmuValidationError';
import { validateSchema } from '@/middleware/validate';
import type { Schema } from '@/types/public';

/**
 * Behaviour when an NDJSON line fails JSON.parse OR schema validation:
 *   - 'throw': stop iteration and propagate (default; matches single-request semantics)
 *   - 'skip':  drop the line silently and continue
 *   - 'yield': yield the underlying error in-band (caller checks each item)
 */
export type NdjsonErrorMode = 'throw' | 'skip' | 'yield';

export interface NdjsonOptions<T> {
  readonly schema?: Schema<T>;
  readonly onError?: NdjsonErrorMode;
}

export type NdjsonItem<T> = T | Error;

/**
 * Parse a `ReadableStream<Uint8Array>` of newline-delimited JSON.
 * Each line is `JSON.parse`d, then optionally validated against `schema`.
 *
 * The cancellation contract mirrors `parseSSE`: closing the iterator cancels
 * the upstream reader, so `break` releases the connection.
 */
export async function* parseNDJSON<T = unknown>(
  stream: ReadableStream<Uint8Array>,
  options?: NdjsonOptions<T>,
): AsyncIterableIterator<NdjsonItem<T>> {
  const mode = options?.onError ?? 'throw';
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        const tail = buffer + decoder.decode();
        if (tail.length > 0) {
          const result = await processLine(tail, options?.schema, mode);
          if (result.kind === 'value') yield result.value;
          else if (result.kind === 'error' && mode === 'yield') yield result.error;
        }
        return;
      }
      buffer += decoder.decode(value, { stream: true });

      let idx = buffer.indexOf('\n');
      while (idx !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (line.length > 0) {
          const result = await processLine(line, options?.schema, mode);
          if (result.kind === 'value') yield result.value;
          else if (result.kind === 'error') {
            if (mode === 'throw') throw result.error;
            if (mode === 'yield') yield result.error;
            // 'skip' → fall through
          }
        }
        idx = buffer.indexOf('\n');
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

type LineResult<T> = { kind: 'value'; value: T } | { kind: 'error'; error: Error };

async function processLine<T>(
  line: string,
  schema: Schema<T> | undefined,
  _mode: NdjsonErrorMode,
): Promise<LineResult<T>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (err) {
    return {
      kind: 'error',
      error: err instanceof Error ? err : new Error(`JSON parse failure: ${String(err)}`),
    };
  }
  if (!schema) return { kind: 'value', value: parsed as T };

  const result = await validateSchema(schema, parsed);
  if (result.ok) return { kind: 'value', value: result.value };
  return {
    kind: 'error',
    error: new AmuValidationError(
      'response',
      'NDJSON line failed schema validation',
      parsed,
      result.issues,
    ),
  };
}
