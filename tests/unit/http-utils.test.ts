import { describe, expect, it } from 'vitest';
import {
  appendQueryParams,
  normalizeRetryPolicy,
  shouldRetryMethod,
  validateProtocolSlashes,
} from '../../src/utils/http.js';
import { AmuUrlError } from '../../src/errors/AmuUrlError.js';

describe('http utils', () => {
  it('appends query params to clean URL', () => {
    const url = appendQueryParams('/users', 'https://api.example.com', { page: 1, limit: 10 });
    expect(url).toBe('https://api.example.com/users?page=1&limit=10');
  });

  it('appends query params when URL already has query string', () => {
    const url = appendQueryParams('/users?active=true', 'https://api.example.com', { page: 1 });
    expect(url).toBe('https://api.example.com/users?active=true&page=1');
  });

  it('uses custom paramsSerializer when provided', () => {
    const url = appendQueryParams(
      '/users',
      'https://api.example.com',
      { page: 1, active: true },
      (params) =>
        Object.entries(params)
          .filter(([, value]) => value != null)
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
          .join('&')
    );
    expect(url).toBe('https://api.example.com/users?page=1&active=true');
  });

  it('overrides existing query params with params values', () => {
    const url = appendQueryParams('/users?sort=asc&page=1', 'https://api.example.com', {
      sort: 'desc',
      active: true,
    });
    expect(url).toBe('https://api.example.com/users?sort=desc&page=1&active=true');
  });

  it('normalizes retry config defaults', () => {
    expect(normalizeRetryPolicy(undefined)).toEqual({
      attempts: 0,
      delay: expect.any(Function),
      retryOn: ['network-error'],
      allowNonIdempotent: false,
    });
  });

  it('normalizes number retry config', () => {
    const policy = normalizeRetryPolicy(2);
    expect(policy.attempts).toBe(2);
    expect(policy.retryOn).toEqual(['network-error']);
    expect(policy.allowNonIdempotent).toBe(false);
  });

  it('treats GET and HEAD as idempotent by default', () => {
    expect(shouldRetryMethod('GET', false)).toBe(true);
    expect(shouldRetryMethod('HEAD', false)).toBe(true);
    expect(shouldRetryMethod('POST', false)).toBe(false);
  });

  it('rejects malformed absolute protocol URL without //', () => {
    expect(() => validateProtocolSlashes('https:google.com')).toThrow(AmuUrlError);
  });

  it('allows valid localhost URL with protocol and port', () => {
    expect(() => validateProtocolSlashes('http://localhost:4000/users')).not.toThrow();
  });
});
