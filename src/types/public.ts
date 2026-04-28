export type AmuSchema<T> =
  | ((input: unknown) => T | Promise<T>)
  | { parse: (input: unknown) => T | Promise<T> };

export interface AmuRetryConfig {
  attempts: number;
  delay?: number | ((attempt: number, error: unknown) => number);
  retryOn?: Array<number | 'network-error'>;
  allowNonIdempotent?: boolean;
}

export interface AmuConfig extends RequestInit {
  baseURL?: string;
  timeout?: number;
  retries?: number | AmuRetryConfig;
  onLoadingChange?: (isLoading: boolean) => void;
  json?: unknown;
  params?: Record<string, string | number | boolean | null | undefined>;
  schema?: AmuSchema<unknown>;
  raw?: boolean;
}

export interface AmuRawResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: AmuConfig;
  request: Response;
}

export interface AmuPromise<T> extends Promise<T> {
  json: <R = unknown>() => Promise<R>;
  text: () => Promise<string>;
  blob: () => Promise<Blob>;
}
