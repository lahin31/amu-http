export interface AmuConfig extends RequestInit {
  baseURL?: string;
  timeout?: number;
  retries?: number;
  onLoadingChange?: (isLoading: boolean) => void;
  json?: unknown;
  params?: Record<string, string | number | boolean | null | undefined>;
}

export interface AmuPromise<T> extends Promise<T> {
  json: <R = unknown>() => Promise<R>;
  text: () => Promise<string>;
  blob: () => Promise<Blob>;
}