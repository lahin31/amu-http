/**
 * Server-Sent Events parser. Spec: https://html.spec.whatwg.org/#server-sent-events
 *
 * Low-level primitive: parses `text/event-stream` into a stream of `SSEEvent`s.
 * Auto-reconnection (browser EventSource behaviour) is NOT included — every
 * provider (OpenAI, Anthropic, etc.) handles disconnects differently, so that
 * concern belongs in user code or a follow-on `sseReconnect` middleware.
 */

export interface SSEEvent {
  /** Event ID. Used by browser auto-reconnect with `Last-Event-ID`. */
  readonly id?: string;
  /** Event name. Defaults to `'message'` per spec when omitted. */
  readonly event?: string;
  /** Event data. Multi-line `data:` fields are joined with `'\n'`. */
  readonly data: string;
  /** Server-suggested reconnect delay in ms. */
  readonly retry?: number;
}

/**
 * Parse a `ReadableStream<Uint8Array>` into an async iterable of SSE events.
 *
 * Cancellation: when the iterator is closed (`break` from `for await`, or an
 * exception inside the loop), the underlying reader is cancelled — propagating
 * upstream and freeing the connection.
 */
export async function* parseSSE(
  stream: ReadableStream<Uint8Array>,
): AsyncIterableIterator<SSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer) {
          const event = parseEventBlock(normalize(buffer));
          if (event) yield event;
        }
        return;
      }
      buffer = normalize(buffer + decoder.decode(value, { stream: true }));
      let idx = buffer.indexOf('\n\n');
      while (idx !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const event = parseEventBlock(block);
        if (event) yield event;
        idx = buffer.indexOf('\n\n');
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Normalize CRLF / CR to LF per the SSE spec. */
function normalize(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseEventBlock(block: string): SSEEvent | null {
  if (block === '') return null;
  let id: string | undefined;
  let event: string | undefined;
  let retry: number | undefined;
  const dataLines: string[] = [];

  for (const rawLine of block.split('\n')) {
    if (rawLine === '' || rawLine.startsWith(':')) continue;
    const colon = rawLine.indexOf(':');
    const field = colon === -1 ? rawLine : rawLine.slice(0, colon);
    let value = colon === -1 ? '' : rawLine.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (field) {
      case 'data':
        dataLines.push(value);
        break;
      case 'event':
        event = value;
        break;
      case 'id':
        id = value;
        break;
      case 'retry':
        if (/^\d+$/.test(value)) retry = Number(value);
        break;
    }
  }

  if (dataLines.length === 0 && id === undefined && event === undefined && retry === undefined) {
    return null;
  }
  return { id, event, data: dataLines.join('\n'), retry };
}
