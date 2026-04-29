/**
 * 09: NDJSON streaming with per-line schema validation.
 *
 * `parseNDJSON` parses newline-delimited JSON line-by-line. Pass `schema` to
 * validate each line; pass `onError: 'yield'` to receive validation errors
 * in-band so a few bad records don't kill the whole stream.
 *
 * Run: npx tsx examples/09-streaming-ndjson.ts
 */

import { AmuValidationError, createClient, parseNDJSON } from 'amu-http';
import { z } from 'zod';

const Item = z.object({ id: z.number(), text: z.string() });

// Demo stream — three good lines and one bad.
const enc = new TextEncoder();
const body = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(enc.encode('{"id":1,"text":"first"}\n'));
    controller.enqueue(enc.encode('{"id":2,"text":"second"}\n'));
    controller.enqueue(enc.encode('{"id":"BAD","text":"will fail validation"}\n'));
    controller.enqueue(enc.encode('{"id":4,"text":"fourth"}\n'));
    controller.close();
  },
});

const api = createClient({ fetch: async () => new Response(body) });

console.log('Iterating NDJSON feed (errors yielded in-band):');
for await (const item of parseNDJSON(await api.stream('/feed'), {
  schema: Item,
  onError: 'yield',
})) {
  if (item instanceof AmuValidationError) {
    console.log(`  ✖ skipped invalid line: ${item.issues[0]?.message}`);
  } else if (item instanceof Error) {
    console.log(`  ✖ parse error: ${item.message}`);
  } else {
    console.log(`  ✓ #${item.id} — ${item.text}`);
  }
}
