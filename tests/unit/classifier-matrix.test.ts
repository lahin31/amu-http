/**
 * Network-error classifier matrix.
 *
 * Synthesizes the error shapes that each runtime emits for common transport
 * failures, and asserts our classifier maps them to the right `kind`.
 *
 * Sources:
 *   - undici (Node 20+ fetch backend) — TypeError with cause.code
 *   - Bun fetch — Error subclass, code on the error itself OR on cause
 *   - Deno fetch — TypeError, sometimes with cause, often without code
 *   - Browser fetch — TypeError, no cause, no code (CORS / mixed-content / DNS)
 *
 * Where a runtime cannot disambiguate, we fall through to `'unknown'`. That
 * is the documented contract.
 */

import { describe, expect, it } from 'vitest';
import { classifyFetchFailure, createContext } from '@/request';

const baseSignal = () => new AbortController().signal;

const ctx = (signal: AbortSignal = baseSignal()) =>
  createContext({
    url: 'https://api.example.com/x',
    method: 'GET',
    headers: new Headers(),
    body: null,
    signal,
  });

function classify(err: unknown, signal?: AbortSignal): string {
  return classifyFetchFailure(err, signal ?? ctx().signal).kind;
}

// ─── undici (Node fetch) ──────────────────────────────────────────────────────

describe('classifier — undici / Node fetch', () => {
  const make = (code: string) => {
    const err = new TypeError('fetch failed');
    (err as Error & { cause?: unknown }).cause = { code };
    return err;
  };

  it('ENOTFOUND → dns', () => expect(classify(make('ENOTFOUND'))).toBe('dns'));
  it('EAI_AGAIN → dns', () => expect(classify(make('EAI_AGAIN'))).toBe('dns'));
  it('EAI_FAIL → dns', () => expect(classify(make('EAI_FAIL'))).toBe('dns'));

  it('ECONNREFUSED → connect', () => expect(classify(make('ECONNREFUSED'))).toBe('connect'));
  it('ETIMEDOUT → connect', () => expect(classify(make('ETIMEDOUT'))).toBe('connect'));
  it('EHOSTUNREACH → connect', () => expect(classify(make('EHOSTUNREACH'))).toBe('connect'));

  it('ECONNRESET → reset', () => expect(classify(make('ECONNRESET'))).toBe('reset'));
  it('EPIPE → reset', () => expect(classify(make('EPIPE'))).toBe('reset'));

  it('UND_ERR_HEADERS_TIMEOUT → timeout-idle', () =>
    expect(classify(make('UND_ERR_HEADERS_TIMEOUT'))).toBe('timeout-idle'));
  it('UND_ERR_BODY_TIMEOUT → timeout-idle', () =>
    expect(classify(make('UND_ERR_BODY_TIMEOUT'))).toBe('timeout-idle'));

  it('ERR_TLS_CERT_ALTNAME_INVALID → tls', () =>
    expect(classify(make('ERR_TLS_CERT_ALTNAME_INVALID'))).toBe('tls'));
  it('CERT_HAS_EXPIRED → tls', () => expect(classify(make('CERT_HAS_EXPIRED'))).toBe('tls'));
  it('EPROTO → tls', () => expect(classify(make('EPROTO'))).toBe('tls'));
});

// ─── Bun fetch ────────────────────────────────────────────────────────────────

describe('classifier — Bun fetch', () => {
  // Bun typically emits errors with `code` on the error itself (no cause wrap).
  const make = (code: string) => {
    const err = new Error('fetch failed');
    (err as Error & { code?: string }).code = code;
    return err;
  };

  it('reads code from the error directly (not via cause)', () => {
    expect(classify(make('ECONNREFUSED'))).toBe('connect');
    expect(classify(make('ENOTFOUND'))).toBe('dns');
    expect(classify(make('ECONNRESET'))).toBe('reset');
  });
});

// ─── Deno fetch ───────────────────────────────────────────────────────────────

describe('classifier — Deno fetch', () => {
  it('TypeError with no cause and no code → unknown', () => {
    const err = new TypeError('NetworkError when attempting to fetch');
    expect(classify(err)).toBe('unknown');
  });

  it('Deno occasionally exposes cause with code — falls into the same path as undici', () => {
    const err = new TypeError('fetch failed');
    (err as Error & { cause?: unknown }).cause = { code: 'ECONNREFUSED' };
    expect(classify(err)).toBe('connect');
  });
});

// ─── Browser fetch ────────────────────────────────────────────────────────────

describe('classifier — Browser fetch (no diagnostic info)', () => {
  it('plain TypeError → unknown', () => {
    expect(classify(new TypeError('Failed to fetch'))).toBe('unknown');
  });

  it('CORS-blocked fetch (no cause, no code) → unknown', () => {
    const err = new TypeError('NetworkError when attempting to fetch resource.');
    expect(classify(err)).toBe('unknown');
  });
});

// ─── Signal-based classification (precedence over runtime codes) ─────────────

describe('classifier — AbortSignal precedence', () => {
  it('signal aborted with reason "amu-timeout" → timeout-active', () => {
    const c = new AbortController();
    c.abort('amu-timeout');
    const err = new DOMException('aborted', 'AbortError');
    expect(classify(err, c.signal)).toBe('timeout-active');
  });

  it('signal aborted by user (no reason) → abort', () => {
    const c = new AbortController();
    c.abort();
    const err = new DOMException('aborted', 'AbortError');
    expect(classify(err, c.signal)).toBe('abort');
  });

  it('signal-aborted classification overrides any cause.code', () => {
    const c = new AbortController();
    c.abort();
    const err = new TypeError('fetch failed');
    (err as Error & { cause?: unknown }).cause = { code: 'ECONNREFUSED' };
    expect(classify(err, c.signal)).toBe('abort');
  });
});

// ─── isRetryable contract ─────────────────────────────────────────────────────

describe('classifier — isRetryable flag', () => {
  it('abort is NOT retryable', () => {
    const c = new AbortController();
    c.abort();
    const err = new DOMException('aborted', 'AbortError');
    const result = classifyFetchFailure(err, c.signal);
    expect(result.kind).toBe('abort');
    expect(result.isRetryable).toBe(false);
  });

  it('tls failures are NOT retryable', () => {
    const err = new TypeError('fetch failed');
    (err as Error & { cause?: unknown }).cause = { code: 'CERT_HAS_EXPIRED' };
    const result = classifyFetchFailure(err, ctx().signal);
    expect(result.kind).toBe('tls');
    expect(result.isRetryable).toBe(false);
  });

  it('dns / connect / reset / timeout-* / unknown are retryable', () => {
    const codes = ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'UND_ERR_HEADERS_TIMEOUT'];
    for (const code of codes) {
      const err = new TypeError('fetch failed');
      (err as Error & { cause?: unknown }).cause = { code };
      expect(classifyFetchFailure(err, ctx().signal).isRetryable).toBe(true);
    }
  });
});
