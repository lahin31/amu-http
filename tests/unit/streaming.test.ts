import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AmuError, AmuValidationError, createClient, parseNDJSON, parseSSE } from '@/index';

const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockReset());

const enc = new TextEncoder();
const streamOf = (chunks: ReadonlyArray<string>): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });

describe('client.stream()', () => {
  it('returns the raw response body unchanged', async () => {
    fetchMock.mockResolvedValue(new Response(streamOf(['hello'])));
    const api = createClient();
    const stream = await api.stream('https://x/raw');
    const reader = stream.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toBe('hello');
    reader.releaseLock();
  });

  it('throws AmuError on non-2xx without consuming body silently', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'gone' }), {
        status: 410,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const api = createClient();
    await expect(api.stream('https://x/error')).rejects.toBeInstanceOf(AmuError);
  });

  it('synthesizes an empty stream when body is null', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const api = createClient();
    const stream = await api.stream('https://x/empty');
    const reader = stream.getReader();
    const { done } = await reader.read();
    expect(done).toBe(true);
    reader.releaseLock();
  });
});

describe('parseSSE composed with client.stream()', () => {
  it('iterates Server-Sent Events', async () => {
    fetchMock.mockResolvedValue(new Response(streamOf(['data: a\n\n', 'data: b\n\n'])));
    const api = createClient();
    const events: string[] = [];
    for await (const e of parseSSE(await api.stream('https://x/sse'))) {
      events.push(e.data);
    }
    expect(events).toEqual(['a', 'b']);
  });

  it('cancels the upstream when consumer breaks', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('data: keep-alive\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    fetchMock.mockResolvedValue(new Response(body));
    const api = createClient();
    for await (const _ of parseSSE(await api.stream('https://x/sse'))) {
      break;
    }
    expect(cancelled).toBe(true);
  });
});

describe('parseNDJSON composed with client.stream()', () => {
  it('iterates JSON lines', async () => {
    fetchMock.mockResolvedValue(new Response(streamOf(['{"id":1}\n{"id":2}\n'])));
    const api = createClient();
    const items: unknown[] = [];
    for await (const i of parseNDJSON<{ id: number }>(await api.stream('https://x/feed'))) {
      items.push(i);
    }
    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('validates per-line with a schema and yields errors in-band', async () => {
    fetchMock.mockResolvedValue(new Response(streamOf(['{"id":1}\n{"id":"bad"}\n{"id":3}\n'])));
    const api = createClient();
    const Item = z.object({ id: z.number() });
    const stream = await api.stream('https://x/feed');
    const out: Array<{ id: number } | Error> = [];
    for await (const i of parseNDJSON(stream, { schema: Item, onError: 'yield' })) {
      out.push(i);
    }
    expect(out[0]).toEqual({ id: 1 });
    expect(out[1]).toBeInstanceOf(AmuValidationError);
    expect(out[2]).toEqual({ id: 3 });
  });
});

describe('body serializer', () => {
  it('passes FormData through with correct content-type set by fetch', async () => {
    fetchMock.mockResolvedValue(
      new Response('{}', { headers: { 'content-type': 'application/json' } }),
    );
    const api = createClient();
    const fd = new FormData();
    fd.set('a', '1');
    await api.post('https://x/upload', fd);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.body).toBeInstanceOf(FormData);
    // We DON'T set content-type for multipart — fetch picks the boundary.
    expect((init?.headers as Headers).get('content-type')).toBeNull();
  });

  it('passes URLSearchParams with form-urlencoded content-type', async () => {
    fetchMock.mockResolvedValue(
      new Response('{}', { headers: { 'content-type': 'application/json' } }),
    );
    const api = createClient();
    const usp = new URLSearchParams({ a: '1' });
    await api.post('https://x/form', usp);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.body).toBeInstanceOf(URLSearchParams);
    expect((init?.headers as Headers).get('content-type')).toContain(
      'application/x-www-form-urlencoded',
    );
  });

  it('passes ReadableStream through (streamed upload)', async () => {
    fetchMock.mockResolvedValue(
      new Response('{}', { headers: { 'content-type': 'application/json' } }),
    );
    const api = createClient();
    const upload = streamOf(['chunk1', 'chunk2']);
    await api.post('https://x/upload', upload, {
      headers: { 'content-type': 'application/octet-stream' },
    });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.body).toBeInstanceOf(ReadableStream);
  });

  it('JSON-stringifies plain objects (default)', async () => {
    fetchMock.mockResolvedValue(
      new Response('{}', { headers: { 'content-type': 'application/json' } }),
    );
    const api = createClient();
    await api.post('https://x/json', { a: 1 });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.body).toBe('{"a":1}');
    expect((init?.headers as Headers).get('content-type')).toBe('application/json');
  });
});
