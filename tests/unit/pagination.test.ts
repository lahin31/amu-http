import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AmuValidationError } from '@/index';
import { cursor, pageToken, paginate, parseLinkHeader } from '@/pagination/index';

interface CursorPage {
  items: number[];
  nextCursor: string | undefined;
}

describe('paginate()', () => {
  it('iterates items across pages until getNext returns null', async () => {
    const fetch = vi.fn<(next: { cursor: string } | null) => Promise<CursorPage>>(async (next) => {
      if (next === null) return { items: [1, 2], nextCursor: 'p2' };
      if (next.cursor === 'p2') return { items: [3, 4], nextCursor: 'p3' };
      if (next.cursor === 'p3') return { items: [5], nextCursor: undefined };
      throw new Error(`unexpected cursor: ${next.cursor}`);
    });

    const items: number[] = [];
    for await (const item of paginate<CursorPage, number, { cursor: string }>({
      fetch,
      getItems: (p) => p.items,
      getNext: (p) => (p.nextCursor ? { cursor: p.nextCursor } : null),
    })) {
      items.push(item);
    }

    expect(items).toEqual([1, 2, 3, 4, 5]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('terminates after one page when getNext returns null', async () => {
    const fetch = vi.fn(async () => ({ items: [1, 2] as number[] }));
    const items: number[] = [];
    for await (const item of paginate({
      fetch,
      getItems: (p: { items: number[] }) => p.items,
      getNext: () => null,
    })) {
      items.push(item);
    }
    expect(items).toEqual([1, 2]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('paginate.pages yields whole pages', async () => {
    const fetch = vi
      .fn<(next: { cursor: string } | null) => Promise<CursorPage>>()
      .mockResolvedValueOnce({ items: [1], nextCursor: 'a' })
      .mockResolvedValueOnce({ items: [2], nextCursor: undefined });

    const got: CursorPage[] = [];
    for await (const page of paginate.pages({
      fetch,
      getNext: (p) => (p.nextCursor ? { cursor: p.nextCursor } : null),
    })) {
      got.push(page);
    }
    expect(got).toEqual([
      { items: [1], nextCursor: 'a' },
      { items: [2], nextCursor: undefined },
    ]);
  });
});

describe('cursor() preset', () => {
  it('produces getItems + getNext that wire a cursor query parameter', async () => {
    const calls: Array<Record<string, string> | null> = [];
    const fetch = async (next: Record<string, string> | null): Promise<CursorPage> => {
      calls.push(next);
      return next === null
        ? { items: [1, 2], nextCursor: 'p2' }
        : { items: [3], nextCursor: undefined };
    };

    const items: number[] = [];
    for await (const item of paginate({
      fetch,
      ...cursor<CursorPage, number>({
        getCursor: (p) => p.nextCursor,
        getItems: (p) => p.items,
      }),
    })) {
      items.push(item);
    }

    expect(items).toEqual([1, 2, 3]);
    expect(calls).toEqual([null, { cursor: 'p2' }]);
  });

  it('respects a custom cursorKey', async () => {
    interface NextPage {
      items: string[];
      next: string | undefined;
    }
    const calls: Array<Record<string, string> | null> = [];
    const fetch = async (n: Record<string, string> | null): Promise<NextPage> => {
      calls.push(n);
      return n === null ? { items: ['a'], next: 'p2' } : { items: ['b'], next: undefined };
    };
    for await (const _ of paginate({
      fetch,
      ...cursor<NextPage, string>({
        getCursor: (p) => p.next,
        cursorKey: 'next',
        getItems: (p) => p.items,
      }),
    })) {
      // drain
    }
    expect(calls[1]).toEqual({ next: 'p2' });
  });
});

describe('pageToken() preset', () => {
  interface TokenPage {
    messages: string[];
    nextPageToken: string | undefined;
  }

  it('uses pageToken key by default', async () => {
    const calls: Array<Record<string, string> | null> = [];
    const fetch = async (n: Record<string, string> | null): Promise<TokenPage> => {
      calls.push(n);
      return n === null
        ? { messages: ['m1'], nextPageToken: 'tok2' }
        : { messages: ['m2'], nextPageToken: undefined };
    };
    for await (const _ of paginate({
      fetch,
      ...pageToken<TokenPage, string>({
        getToken: (p) => p.nextPageToken,
        getItems: (p) => p.messages,
      }),
    })) {
      // drain
    }
    expect(calls).toEqual([null, { pageToken: 'tok2' }]);
  });
});

describe('paginate() with schema', () => {
  const PageSchema = z.object({
    items: z.array(z.object({ id: z.number() })),
    nextCursor: z.string().optional(),
  });

  type Page = z.infer<typeof PageSchema>;

  it('validates each fetched page and yields typed items', async () => {
    const fetch = vi
      .fn<(next: { cursor: string } | null) => Promise<Page>>()
      .mockResolvedValueOnce({ items: [{ id: 1 }], nextCursor: 'p2' })
      .mockResolvedValueOnce({ items: [{ id: 2 }], nextCursor: undefined });

    const items: { id: number }[] = [];
    for await (const item of paginate({
      fetch,
      schema: PageSchema,
      getItems: (p) => p.items,
      getNext: (p) => (p.nextCursor ? { cursor: p.nextCursor } : null),
    })) {
      items.push(item);
    }

    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws AmuValidationError when a page fails validation', async () => {
    const fetch = vi
      .fn<(next: { cursor: string } | null) => Promise<Page>>()
      .mockResolvedValueOnce({ items: [{ id: 1 }], nextCursor: 'p2' })
      // @ts-expect-error — deliberately bad shape to exercise runtime guard
      .mockResolvedValueOnce({ items: [{ id: 'BAD' }] });

    const got: unknown[] = [];
    await expect(
      (async () => {
        for await (const item of paginate({
          fetch,
          schema: PageSchema,
          getItems: (p) => p.items,
          getNext: (p) => (p.nextCursor ? { cursor: p.nextCursor } : null),
        })) {
          got.push(item);
        }
      })(),
    ).rejects.toBeInstanceOf(AmuValidationError);

    expect(got).toEqual([{ id: 1 }]);
  });

  it('paginate.pages also validates against schema', async () => {
    const fetch = vi
      .fn<(next: { cursor: string } | null) => Promise<Page>>()
      .mockResolvedValueOnce({ items: [{ id: 1 }], nextCursor: undefined });

    const pages: Page[] = [];
    for await (const page of paginate.pages({
      fetch,
      schema: PageSchema,
      getNext: (p) => (p.nextCursor ? { cursor: p.nextCursor } : null),
    })) {
      pages.push(page);
    }

    expect(pages).toEqual([{ items: [{ id: 1 }], nextCursor: undefined }]);
  });
});

describe('parseLinkHeader()', () => {
  it('parses GitHub-style Link header', () => {
    const header =
      '<https://api.github.com/repos/x/y/issues?page=2>; rel="next", ' +
      '<https://api.github.com/repos/x/y/issues?page=5>; rel="last"';
    expect(parseLinkHeader(header)).toEqual({
      next: 'https://api.github.com/repos/x/y/issues?page=2',
      last: 'https://api.github.com/repos/x/y/issues?page=5',
    });
  });

  it('returns empty object for null/undefined/empty', () => {
    expect(parseLinkHeader(null)).toEqual({});
    expect(parseLinkHeader(undefined)).toEqual({});
    expect(parseLinkHeader('')).toEqual({});
  });
});
