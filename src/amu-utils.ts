import { AmuConfig } from './types.js';

export interface AmuDefaults {
  baseURL: string;
  timeout: number;
  headers: HeadersInit;
  retries: number;
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
