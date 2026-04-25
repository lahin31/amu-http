import { AmuConfig, AmuRetryConfig } from '../types/public.js';
import { AmuError } from '../errors/AmuError.js';

export interface AmuDefaults {
  baseURL: string;
  timeout: number;
  headers: HeadersInit;
  retries: number | AmuRetryConfig;
}

export function createDefaults(config: AmuConfig): AmuDefaults {
  return {
    baseURL: config.baseURL || '',
    timeout: config.timeout || 10000,
    headers: { 'Content-Type': 'application/json', ...config.headers },
    retries: config.retries || 0,
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

export interface NormalizedRetryPolicy {
  attempts: number;
  delay: (attempt: number, error: unknown) => number;
  retryOn: number[];
}

const DEFAULT_RETRY_STATUS_CODES = [429, 500, 502, 503, 504];

export function normalizeRetryPolicy(
  retries: AmuConfig['retries'] | undefined
): NormalizedRetryPolicy {
  if (typeof retries === 'number') {
    return {
      attempts: Math.max(0, retries),
      delay: () => 0,
      retryOn: DEFAULT_RETRY_STATUS_CODES,
    };
  }

  if (!retries) {
    return { attempts: 0, delay: () => 0, retryOn: DEFAULT_RETRY_STATUS_CODES };
  }

  return {
    attempts: Math.max(0, retries.attempts),
    delay:
      typeof retries.delay === 'function'
        ? retries.delay
        : () => (typeof retries.delay === 'number' ? retries.delay : 0),
    retryOn: retries.retryOn?.length ? retries.retryOn : DEFAULT_RETRY_STATUS_CODES,
  };
}

export function shouldRetryError(error: unknown, retryOn: number[]): boolean {
  if (error instanceof AmuError) {
    return retryOn.includes(error.status);
  }
  return getErrorName(error) !== 'AbortError';
}

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
