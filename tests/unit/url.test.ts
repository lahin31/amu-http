import { describe, expect, it } from 'vitest';
import { AmuUrlError } from '@/errors/AmuUrlError';
import {
  appendQuery,
  buildUrl,
  interpolateParams,
  resolveUrl,
  validateProtocolSlashes,
} from '@/url';

describe('validateProtocolSlashes', () => {
  it('accepts well-formed URLs', () => {
    expect(() => validateProtocolSlashes('https://api.example.com')).not.toThrow();
    expect(() => validateProtocolSlashes('http://localhost:3000/users')).not.toThrow();
    expect(() => validateProtocolSlashes('/relative/path')).not.toThrow();
  });

  it('throws AmuUrlError with suggestion for missing slashes', () => {
    expect(() => validateProtocolSlashes('https:google.com')).toThrowError(AmuUrlError);
    try {
      validateProtocolSlashes('https:google.com');
    } catch (err) {
      if (err instanceof AmuUrlError) {
        expect(err.input).toBe('https:google.com');
        expect(err.suggestion).toBe('https://google.com');
      }
    }
  });
});

describe('interpolateParams', () => {
  it('substitutes single param', () => {
    expect(interpolateParams('/users/:id', { id: 1 })).toBe('/users/1');
  });

  it('substitutes multiple params', () => {
    expect(interpolateParams('/users/:id/posts/:postId', { id: 1, postId: 'a' })).toBe(
      '/users/1/posts/a',
    );
  });

  it('returns path unchanged when no params', () => {
    expect(interpolateParams('/users', undefined)).toBe('/users');
  });

  it('throws AmuUrlError when required key is missing', () => {
    expect(() => interpolateParams('/users/:id', {})).toThrow(AmuUrlError);
  });

  it('encodes values via encodeURIComponent', () => {
    expect(interpolateParams('/search/:q', { q: 'hello world' })).toBe('/search/hello%20world');
  });
});

describe('resolveUrl', () => {
  it('returns absolute URL as-is', () => {
    expect(resolveUrl('https://api.example.com/users', 'https://other.com')).toBe(
      'https://api.example.com/users',
    );
  });

  it('joins baseURL + path', () => {
    expect(resolveUrl('/users', 'https://api.example.com')).toBe('https://api.example.com/users');
  });

  it('handles double-slash collisions', () => {
    expect(resolveUrl('/users', 'https://api.example.com/')).toBe('https://api.example.com/users');
    expect(resolveUrl('users', 'https://api.example.com')).toBe('https://api.example.com/users');
  });

  it('throws on malformed protocol', () => {
    expect(() => resolveUrl('https:google.com', undefined)).toThrow(AmuUrlError);
  });
});

describe('appendQuery', () => {
  it('appends to URL without existing query', () => {
    expect(appendQuery('https://api.example.com/users', { page: 1, limit: 10 })).toBe(
      'https://api.example.com/users?page=1&limit=10',
    );
  });

  it('appends with & when query already present', () => {
    expect(appendQuery('https://api.example.com/users?cursor=abc', { limit: 5 })).toBe(
      'https://api.example.com/users?cursor=abc&limit=5',
    );
  });

  it('skips null and undefined values', () => {
    expect(appendQuery('/x', { a: 1, b: null, c: undefined, d: 'ok' })).toBe('/x?a=1&d=ok');
  });

  it('returns URL unchanged for empty query', () => {
    expect(appendQuery('/x', {})).toBe('/x');
    expect(appendQuery('/x', undefined)).toBe('/x');
  });
});

describe('buildUrl', () => {
  it('composes path + base + params + query', () => {
    expect(
      buildUrl({
        path: '/users/:id/posts',
        baseURL: 'https://api.example.com',
        params: { id: 1 },
        query: { limit: 5 },
      }),
    ).toBe('https://api.example.com/users/1/posts?limit=5');
  });

  it('works with absolute path and no base', () => {
    expect(
      buildUrl({
        path: 'https://api.example.com/users',
        baseURL: undefined,
        params: undefined,
        query: undefined,
      }),
    ).toBe('https://api.example.com/users');
  });
});
