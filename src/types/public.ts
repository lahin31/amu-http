export type AmuParams = Record<string, string | number | boolean | null | undefined>;

export type AmuSchema<T> =
  | ((input: unknown) => T | Promise<T>)
  | { parse: (input: unknown) => T | Promise<T> };

export interface AmuRetryConfig {
  attempts: number;
  delay?: number | ((attempt: number, error: unknown) => number);
  retryOn?: Array<number | 'network-error'>;
  allowNonIdempotent?: boolean;
}

export interface AmuRetryHookContext {
  attempt: number;
  maxAttempts: number;
  delay: number;
  error: unknown;
  reason: string;
  method: string;
  url: string;
}

export interface AmuRetryCompleteHookContext {
  success: boolean;
  totalAttempts: number;
  totalRetries: number;
  totalDuration: number;
  finalStatus?: number;
  error?: unknown;
  method: string;
  url: string;
}

export interface AmuHooks {
  onRetry?: (ctx: AmuRetryHookContext) => void;
  onRetryComplete?: (ctx: AmuRetryCompleteHookContext) => void;
}

export interface AmuConfig extends RequestInit {
  baseURL?: string;
  timeout?: number;
  retries?: number | AmuRetryConfig;
  debug?: boolean;
  onLoadingChange?: (isLoading: boolean) => void;
  json?: unknown;
  params?: AmuParams;
  paramsSerializer?: (params: AmuParams) => string;
  schema?: AmuSchema<unknown>;
  raw?: boolean;
  hooks?: AmuHooks;
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