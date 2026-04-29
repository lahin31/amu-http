import { describe, expect, it } from 'vitest';
import { parseSSE } from '@/streaming/sse';

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

describe('parseSSE', () => {
  it('parses a single event with data', async () => {
    const stream = streamFrom(['data: hello\n\n']);
    const events = await collect(parseSSE(stream));
    expect(events).toEqual([{ data: 'hello' }]);
  });

  it('joins multi-line data with \\n', async () => {
    const stream = streamFrom(['data: line1\ndata: line2\n\n']);
    const events = await collect(parseSSE(stream));
    expect(events).toEqual([{ data: 'line1\nline2' }]);
  });

  it('parses id, event, retry, and data fields', async () => {
    const stream = streamFrom(['id: 42\nevent: ping\nretry: 5000\ndata: hi\n\n']);
    const events = await collect(parseSSE(stream));
    expect(events).toEqual([{ id: '42', event: 'ping', retry: 5000, data: 'hi' }]);
  });

  it('ignores comment lines starting with `:`', async () => {
    const stream = streamFrom([': keep-alive\ndata: real\n\n']);
    const events = await collect(parseSSE(stream));
    expect(events).toEqual([{ data: 'real' }]);
  });

  it('handles split chunks across the network boundary', async () => {
    const stream = streamFrom(['data: hel', 'lo\n\nda', 'ta: world\n\n']);
    const events = await collect(parseSSE(stream));
    expect(events).toEqual([{ data: 'hello' }, { data: 'world' }]);
  });

  it('flushes a trailing event without terminating blank line', async () => {
    const stream = streamFrom(['data: trailing']);
    const events = await collect(parseSSE(stream));
    expect(events).toEqual([{ data: 'trailing' }]);
  });

  it('normalizes CRLF and CR line endings', async () => {
    const stream = streamFrom(['data: a\r\ndata: b\r\r']);
    const events = await collect(parseSSE(stream));
    expect(events).toEqual([{ data: 'a\nb' }]);
  });

  it('cancels upstream when iterator is broken', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('data: 1\n\n'));
        // Don't close — simulate an open SSE channel
      },
      cancel() {
        cancelled = true;
      },
    });

    for await (const _ of parseSSE(stream)) {
      break;
    }

    expect(cancelled).toBe(true);
  });
});
