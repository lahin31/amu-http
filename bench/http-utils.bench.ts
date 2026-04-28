import { bench, describe } from 'vitest';
import { appendQueryParams, normalizeRetryPolicy, shouldRetryMethod } from '@/utils/http';

describe('appendQueryParams', () => {
  bench('absolute URL, no params', () => {
    appendQueryParams('https://api.example.com/users', '');
  });

  bench('relative path with baseURL', () => {
    appendQueryParams('/users', 'https://api.example.com');
  });

  bench('relative path + small query object', () => {
    appendQueryParams('/users', 'https://api.example.com', { page: 1, limit: 25 });
  });

  bench('relative path + 8-key query object', () => {
    appendQueryParams('/users', 'https://api.example.com', {
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

describe('normalizeRetryPolicy', () => {
  bench('numeric retries shorthand', () => {
    normalizeRetryPolicy(3);
  });

  bench('full retry config object', () => {
    normalizeRetryPolicy({
      attempts: 3,
      delay: (n) => 2 ** n * 100,
      retryOn: ['network-error', 429, 500, 502, 503, 504],
      allowNonIdempotent: false,
    });
  });

  bench('undefined (default policy)', () => {
    normalizeRetryPolicy(undefined);
  });
});

describe('shouldRetryMethod', () => {
  bench('GET (idempotent default)', () => {
    shouldRetryMethod('GET', false);
  });

  bench('POST (non-idempotent default)', () => {
    shouldRetryMethod('POST', false);
  });

  bench('POST with allowNonIdempotent', () => {
    shouldRetryMethod('POST', true);
  });
});
