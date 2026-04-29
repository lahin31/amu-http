/**
 * 08: Server-Sent Events with `parseSSE`.
 *
 * `client.stream()` returns the raw `ReadableStream<Uint8Array>` — compose
 * with `parseSSE` (tree-shaken when not imported) to get an iterable of
 * structured `SSEEvent` objects.
 *
 * Cancellation: `break`-ing out of the loop cancels the underlying stream
 * and frees the connection.
 *
 * Run: npx tsx examples/08-streaming-sse.ts
 */
import { createClient, parseSSE } from 'amu-http';

// Demo: an in-process stream simulating an SSE feed.
const enc = new TextEncoder();
const body = new ReadableStream<Uint8Array>({
  async start(controller) {
    for (const text of ['Hello', 'world', 'from', 'amu', 'streaming']) {
      controller.enqueue(enc.encode(`data: ${text}\n\n`));
      await new Promise((r) => setTimeout(r, 60));
    }
    controller.close();
  },
});

const api = createClient({
  fetch: async () => new Response(body),
});

console.log('Subscribing to SSE feed:');
for await (const event of parseSSE(await api.stream('/events'))) {
  console.log('  ←', event.data);
}
console.log('Stream complete.');
