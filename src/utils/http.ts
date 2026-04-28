import { AmuConfig, AmuHooks, AmuRetryConfig } from '../types/public.js';
import { AmuError } from '../errors/AmuError.js';
import { AmuNetworkError, AmuNetworkErrorKind } from '../errors/AmuNetworkError.js';
import { AmuUrlError } from '../errors/AmuUrlError.js';

export interface AmuDefaults {
  baseURL: string;
  timeout: number;
  headers: HeadersInit;
  retries: number | AmuRetryConfig;
  hooks: AmuHooks;
}

export function createDefaults(config: AmuConfig): AmuDefaults {
  return {
    baseURL: config.baseURL || '',
    timeout: config.timeout || 10000,
    headers: { 'Content-Type': 'application/json', ...config.headers },
    retries: config.retries || 0,
    hooks: config.hooks || {},
  };
}

export function getErrorName(err: unknown): string | undefined {
  if (err instanceof Error) return err.name;
  if (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    typeof (err as { name: unknown }).name === 'string'
  ) {
    return (err as { name: string }).name;
  }
  return undefined;
}

export function appendQueryParams(
  endpoint: string,
  baseURL: string,
  params?: AmuConfig['params']
): string {
  validateProtocolSlashes(endpoint);

  let url = endpoint.startsWith('http') ? endpoint : `${baseURL}${endpoint}`;
  if (!params) return url;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  if (query) {
    url += (url.includes('?') ? '&' : '?') + query;
  }
  return url;
}

const MALFORMED_PROTOCOL_RE = /^https?:[^/]/i;

export function validateProtocolSlashes(url: string): void {
  if (!MALFORMED_PROTOCOL_RE.test(url)) return;
  const suggestion = url.replace(/^([a-z]+:)(?!\/\/)/i, '$1//');
  throw new AmuUrlError(url, suggestion);
}

export interface NormalizedRetryPolicy {
  attempts: number;
  delay: (attempt: number, error: unknown) => number;
  retryOn: Array<number | 'network-error'>;
  allowNonIdempotent: boolean;
}

const DEFAULT_RETRY_TARGETS: Array<number | 'network-error'> = ['network-error'];

export function normalizeRetryPolicy(
  retries: AmuConfig['retries'] | undefined
): NormalizedRetryPolicy {
  if (typeof retries === 'number') {
    return {
      attempts: Math.max(0, retries),
      delay: () => 0,
      retryOn: DEFAULT_RETRY_TARGETS,
      allowNonIdempotent: false,
    };
  }

  if (!retries) {
    return { attempts: 0, delay: () => 0, retryOn: DEFAULT_RETRY_TARGETS, allowNonIdempotent: false };
  }

  return {
    attempts: Math.max(0, retries.attempts),
    delay:
      typeof retries.delay === 'function'
        ? retries.delay
        : () => (typeof retries.delay === 'number' ? retries.delay : 0),
    retryOn: retries.retryOn?.length ? retries.retryOn : DEFAULT_RETRY_TARGETS,
    allowNonIdempotent: retries.allowNonIdempotent ?? false,
  };
}

const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD']);

export function shouldRetryMethod(method: string | undefined, allowNonIdempotent: boolean): boolean {
  if (allowNonIdempotent) return true;
  const normalizedMethod = (method ?? 'GET').toUpperCase();
  return IDEMPOTENT_METHODS.has(normalizedMethod);
}

export function shouldRetryError(error: unknown, retryOn: Array<number | 'network-error'>): boolean {
  if (error instanceof AmuNetworkError) {
    return error.isRetryable;
  }
  if (error instanceof AmuError) {
    return retryOn.includes(error.status);
  }
  if (getErrorName(error) === 'AbortError') {
    return false;
  }
  return retryOn.includes('network-error');
}

export function classifyNetworkError(error: unknown, didTimeout: boolean): AmuNetworkErrorKind {
  if (didTimeout) return 'timeout';

  const name = getErrorName(error);
  if (name === 'AbortError') return 'abort';

  if (
    error instanceof TypeError ||
    (typeof error === 'object' && error !== null && 'code' in error)
  ) {
    return 'network';
  }

  return 'unknown';
}

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
