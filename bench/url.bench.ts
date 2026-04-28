import { bench, describe } from 'vitest';
import { appendQuery, buildUrl, interpolateParams } from '@/url';

describe('interpolateParams', () => {
  bench('no params (fast path)', () => {
    interpolateParams('/users', undefined);
  });

  bench('single param', () => {
    interpolateParams('/users/:id', { id: 1 });
  });

  bench('two params', () => {
    interpolateParams('/users/:id/posts/:postId', { id: 1, postId: 'a' });
  });
});

describe('appendQuery', () => {
  bench('empty query', () => {
    appendQuery('https://api.example.com/users', undefined);
  });

  bench('small query (2 keys)', () => {
    appendQuery('https://api.example.com/users', { page: 1, limit: 25 });
  });

  bench('larger query (8 keys)', () => {
    appendQuery('https://api.example.com/users', {
      page: 1,
      limit: 25,
      sort: 'created_at',
      order: 'desc',
      filter: 'active',
      include: 'profile',
      cursor: 'abc123',
      lang: 'en',
    });
  });
});

describe('buildUrl (composed)', () => {
  bench('absolute URL, nothing to do', () => {
    buildUrl({
      path: 'https://api.example.com/users',
      baseURL: undefined,
      params: undefined,
      query: undefined,
    });
  });

  bench('base + path + params + query', () => {
    buildUrl({
      path: '/users/:id/posts',
      baseURL: 'https://api.example.com',
      params: { id: 1 },
      query: { limit: 5 },
    });
  });
});
