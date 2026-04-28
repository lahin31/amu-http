/**
 * Pagination helper.
 *
 * `paginate()` is a generic async iterator over paged endpoints. The user
 * supplies three small functions:
 *
 *   - `fetch(next)`   — issues one request. `next` is `null` for the first
 *                       page; subsequent calls receive whatever `getNext`
 *                       returned for the previous page.
 *   - `getItems(page)`— extracts items from a page; iterates them out.
 *   - `getNext(page)` — computes the input for the next `fetch` call, or
 *                       `null` to terminate iteration.
 *
 * Three preset shapes (`cursor`, `pageToken`, `linkHeader`) cover the most
 * common server conventions; you can also write `getItems` / `getNext` by
 * hand for custom schemes.
 */

export interface PaginateOptions<Page, Item, NextHint = unknown> {
  /** Fetch one page. `next` is null on the first call. */
  readonly fetch: (next: NextHint | null) => Promise<Page>;
  /** Extract items from a page. */
  readonly getItems: (page: Page) => Iterable<Item> | AsyncIterable<Item>;
  /** Compute the next-page hint, or null to stop. */
  readonly getNext: (page: Page) => NextHint | null;
}

/**
 * Iterate every item across all pages, lazily.
 *
 * @example
 *   for await (const user of paginate({
 *     fetch: (next) => api.get('/users', { query: { ...next ?? { limit: 50 } } }),
 *     getItems: (p) => p.items,
 *     getNext: (p) => p.nextCursor ? { cursor: p.nextCursor } : null,
 *   })) {
 *     console.log(user.id);
 *   }
 */
export async function* paginate<Page, Item, NextHint = unknown>(
  opts: PaginateOptions<Page, Item, NextHint>,
): AsyncIterableIterator<Item> {
  let next: NextHint | null = null;
  while (true) {
    const page = await opts.fetch(next);
    for await (const item of opts.getItems(page)) {
      yield item;
    }
    next = opts.getNext(page);
    if (next === null) return;
  }
}

/**
 * Iterate whole pages instead of items. Useful when you need page metadata
 * (totals, headers) alongside the items.
 *
 * @example
 *   for await (const page of paginate.pages({ ... })) {
 *     console.log(page.totalCount);
 *     for (const item of page.items) handle(item);
 *   }
 */
paginate.pages = async function* <Page, NextHint = unknown>(opts: {
  readonly fetch: (next: NextHint | null) => Promise<Page>;
  readonly getNext: (page: Page) => NextHint | null;
}): AsyncIterableIterator<Page> {
  let next: NextHint | null = null;
  while (true) {
    const page = await opts.fetch(next);
    yield page;
    next = opts.getNext(page);
    if (next === null) return;
  }
};

// ─── Strategy presets ─────────────────────────────────────────────────────────

/**
 * Cursor-based pagination: server returns a continuation cursor inline with
 * each page. Common in Stripe, Notion, and most modern REST APIs.
 */
export function cursor<Page, Item>(spec: {
  readonly getCursor: (page: Page) => string | null | undefined;
  readonly cursorKey?: string;
  readonly getItems: (page: Page) => Iterable<Item>;
}): Pick<PaginateOptions<Page, Item, Record<string, string>>, 'getItems' | 'getNext'> {
  const cursorKey = spec.cursorKey ?? 'cursor';
  return {
    getItems: spec.getItems,
    getNext: (page) => {
      const c = spec.getCursor(page);
      return c ? { [cursorKey]: c } : null;
    },
  };
}

/**
 * Page-token pagination: Google APIs / GCP style. Same shape as cursor, with
 * the conventional key name `pageToken`.
 */
export function pageToken<Page, Item>(spec: {
  readonly getToken: (page: Page) => string | null | undefined;
  readonly tokenKey?: string;
  readonly getItems: (page: Page) => Iterable<Item>;
}): Pick<PaginateOptions<Page, Item, Record<string, string>>, 'getItems' | 'getNext'> {
  return cursor({
    getCursor: spec.getToken,
    cursorKey: spec.tokenKey ?? 'pageToken',
    getItems: spec.getItems,
  });
}

/**
 * Parse a `Link` header (RFC 5988 / GitHub-style) into a map of `rel → URL`.
 *
 * @example
 *   parseLinkHeader('<https://api/x?page=2>; rel="next", <https://api/x?page=5>; rel="last"')
 *   // → { next: 'https://api/x?page=2', last: 'https://api/x?page=5' }
 */
export function parseLinkHeader(header: string | null | undefined): Record<string, string> {
  if (!header) return {};
  const links: Record<string, string> = {};
  for (const segment of header.split(',')) {
    const m = segment.trim().match(/^<([^>]*)>;\s*rel="?([^"]+)"?/);
    if (m && m[1] && m[2]) links[m[2]] = m[1];
  }
  return links;
}
