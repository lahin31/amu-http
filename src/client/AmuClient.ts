import { AmuConfig, AmuPromise, AmuSchema } from '../types/public.js';
import {
  appendQueryParams,
  classifyNetworkError,
  createDefaults,
  AmuDefaults,
  normalizeRetryPolicy,
  shouldRetryError,
  shouldRetryMethod,
  sleep,
} from '../utils/http.js';
import { AmuError } from '../errors/AmuError.js';
import { AmuNetworkError } from '../errors/AmuNetworkError.js';
import { AmuUrlError } from '../errors/AmuUrlError.js';
import { AmuValidationError } from '../errors/AmuValidationError.js';

export class Amu {
  public defaults: AmuDefaults;
  public activeRequests = 0;
  private onLoadingChange: (isLoading: boolean) => void;

  constructor(config: AmuConfig = {}) {
    this.defaults = createDefaults(config);
    this.onLoadingChange = config.onLoadingChange || (() => {});
  }

  private updateLoading(delta: number) {
    this.activeRequests += delta;
    this.onLoadingChange(this.activeRequests > 0);
  }

  private async validateWithSchema<T>(schema: AmuSchema<unknown>, data: unknown): Promise<T> {
    try {
      if (typeof schema === 'function') {
        return (await schema(data)) as T;
      }
      return (await schema.parse(data)) as T;
    } catch (err: unknown) {
      const issues =
        typeof err === 'object' && err !== null && 'issues' in err
          ? (err as { issues: unknown }).issues
          : undefined;
      throw new AmuValidationError('Response schema validation failed.', data, issues);
    }
  }

  private async parseResponseBody(response: Response, clone = false): Promise<unknown> {
    const target = clone ? response.clone() : response;
    if (response.status === 204) return null;
    const contentType = target.headers.get('content-type') || '';
    return contentType.includes('application/json') ? await target.json() : await target.text();
  }

  request<T = unknown>(endpoint: string, options: AmuConfig = {}): AmuPromise<T> {
    const retryPolicy = normalizeRetryPolicy(options.retries ?? this.defaults.retries);

    const execute = async (retriesLeft: number, attempt = 0): Promise<Response> => {
      const config = {
        ...this.defaults,
        ...options,
        headers: { ...this.defaults.headers, ...options.headers },
      };
      const requestMethod = (config.method ?? 'GET').toString().toUpperCase();

      const url = appendQueryParams(endpoint, this.defaults.baseURL, options.params);

      if (options.json) {
        config.body = JSON.stringify(options.json);
      }

      this.updateLoading(1);
      const controller = new AbortController();
      let didTimeout = false;
      const timer = setTimeout(() => {
        didTimeout = true;
        controller.abort();
      }, config.timeout);

      try {
        const response = await fetch(url, { ...config, signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) {
          const errorData = await this.parseResponseBody(response);
          throw new AmuError(response.status, errorData, response.headers);
        }
        return response;
      } catch (err: unknown) {
        clearTimeout(timer);
        const normalizedError =
          err instanceof AmuError || err instanceof AmuValidationError || err instanceof AmuUrlError
            ? err
            : new AmuNetworkError(
                classifyNetworkError(err, didTimeout),
                shouldRetryError(err, retryPolicy.retryOn),
                err
              );
        if (
          retriesLeft > 0 &&
          shouldRetryMethod(requestMethod, retryPolicy.allowNonIdempotent) &&
          shouldRetryError(normalizedError, retryPolicy.retryOn)
        ) {
          const delayMs = retryPolicy.delay(attempt + 1, normalizedError);
          await sleep(delayMs);
          return execute(retriesLeft - 1, attempt + 1);
        }
        throw normalizedError;
      } finally {
        this.updateLoading(-1);
      }
    };

    const responsePromise = execute(retryPolicy.attempts);

    const parsedPromise = responsePromise.then(async (res: Response) => {
      const data = await this.parseResponseBody(res, true);
      if (!options.schema) return data as T;
      return this.validateWithSchema<T>(options.schema, data);
    }) as AmuPromise<T>;

    parsedPromise.json = async <R = unknown>() => (await responsePromise).clone().json() as Promise<R>;
    parsedPromise.text = async () => (await responsePromise).clone().text();
    parsedPromise.blob = async () => (await responsePromise).clone().blob();

    return parsedPromise;
  }

  get<T = unknown>(url: string, config?: AmuConfig) {
    return this.request<T>(url, { ...config, method: 'GET' });
  }

  post<T = unknown>(url: string, data?: unknown, config?: AmuConfig) {
    return this.request<T>(url, { ...config, method: 'POST', json: data });
  }

  put<T = unknown>(url: string, data?: unknown, config?: AmuConfig) {
    return this.request<T>(url, { ...config, method: 'PUT', json: data });
  }

  patch<T = unknown>(url: string, data?: unknown, config?: AmuConfig) {
    return this.request<T>(url, { ...config, method: 'PATCH', json: data });
  }

  delete<T = unknown>(url: string, config?: AmuConfig) {
    return this.request<T>(url, { ...config, method: 'DELETE' });
  }
}
