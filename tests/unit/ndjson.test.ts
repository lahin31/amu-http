import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AmuValidationError } from '@/errors/AmuValidationError';
import { parseNDJSON } from '@/streaming/ndjson';

const enc = new TextEncoder();

function streamFrom(chunks: ReadonlyArray<string>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of it) out.push(v);
  return out;
}

describe('parseNDJSON', () => {
  it('yields parsed JSON lines', async () => {
    const stream = streamFrom(['{"a":1}\n{"a":2}\n']);
    const items = await collect(parseNDJSON<{ a: number }>(stream));
    expect(items).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('flushes a trailing line without final newline', async () => {
    const stream = streamFrom(['{"x":1}']);
    const items = await collect(parseNDJSON(stream));
    expect(items).toEqual([{ x: 1 }]);
  });

  it('handles split chunks across the network boundary', async () => {
    const stream = streamFrom(['{"a":1}\n{"a":', '2}\n{"a":3}']);
    const items = await collect(parseNDJSON<{ a: number }>(stream));
    expect(items).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it('skips blank lines', async () => {
    const stream = streamFrom(['{"a":1}\n\n{"a":2}\n']);
    const items = await collect(parseNDJSON<{ a: number }>(stream));
    expect(items).toEqual([{ a: 1 }, { a: 2 }]);
  });

  describe('with schema', () => {
    const Item = z.object({ id: z.number() });

    it('validates each line', async () => {
      const stream = streamFrom(['{"id":1}\n{"id":2}\n']);
      const items = await collect(parseNDJSON(stream, { schema: Item }));
      expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('throws by default on validation failure', async () => {
      const stream = streamFrom(['{"id":1}\n{"id":"wrong"}\n{"id":3}\n']);
      await expect(collect(parseNDJSON(stream, { schema: Item }))).rejects.toBeInstanceOf(
        AmuValidationError,
      );
    });

    it('skips bad lines when onError = "skip"', async () => {
      const stream = streamFrom(['{"id":1}\n{"id":"wrong"}\n{"id":3}\n']);
      const items = await collect(parseNDJSON(stream, { schema: Item, onError: 'skip' }));
      expect(items).toEqual([{ id: 1 }, { id: 3 }]);
    });

    it('yields errors in-band when onError = "yield"', async () => {
      const stream = streamFrom(['{"id":1}\n{"id":"wrong"}\n{"id":3}\n']);
      const items = await collect(parseNDJSON(stream, { schema: Item, onError: 'yield' }));
      expect(items).toHaveLength(3);
      expect(items[0]).toEqual({ id: 1 });
      expect(items[1]).toBeInstanceOf(AmuValidationError);
      expect(items[2]).toEqual({ id: 3 });
    });
  });

  it('cancels upstream when iterator is broken', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('{"a":1}\n'));
        // Don't close — open stream
      },
      cancel() {
        cancelled = true;
      },
    });

    for await (const _ of parseNDJSON(stream)) {
      break;
    }

    expect(cancelled).toBe(true);
  });
});
