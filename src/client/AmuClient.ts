import type { AmuConfig, AmuPromise, AmuRawResponse, AmuSchema } from '../types/public.js';
import {
  appendQueryParams,
  classifyNetworkError,
  createDefaults,
  normalizeRetryPolicy,
  shouldRetryError,
  shouldRetryMethod,
  sleep,
} from '../utils/http.js';
import type { AmuDefaults } from '../utils/http.js';
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

  private toRawHeaders(headers: Headers): Record<string, string> {
    return Object.fromEntries(headers.entries());
  }

  private toRetryReason(error: unknown): string {
    if (error instanceof AmuError) return `http-${error.status}`;
    if (error instanceof AmuNetworkError) return error.kind;
    if (error instanceof Error && error.name) return error.name;
    return 'unknown';
  }

  private safeInvoke(callback: (() => void) | undefined): void {
    if (!callback) return;
    try {
      callback();
    } catch {
      // Hooks should not alter request success/failure semantics.
    }
  }

  private logLatency(
    config: AmuConfig,
    payload: { method: string; url: string; duration: number; attempts: number; status?: number; error?: unknown }
  ): void {
    if (!config.debug) return;
    const base = `[amu][latency] ${payload.method} ${payload.url} ${payload.duration}ms attempts=${payload.attempts}`;
    if (typeof payload.status === 'number') {
      console.info(`${base} status=${payload.status}`);
      return;
    }
    console.info(`${base} error=${this.toRetryReason(payload.error)}`);
  }

  request<T = unknown>(endpoint: string, options: AmuConfig & { raw: true }): AmuPromise<AmuRawResponse<T>>;
  request<T = unknown>(endpoint: string, options?: AmuConfig): AmuPromise<T>;
  request<T = unknown>(endpoint: string, options: AmuConfig = {}): AmuPromise<T | AmuRawResponse<T>> {
    const retryPolicy = normalizeRetryPolicy(options.retries ?? this.defaults.retries);
    let finalConfig: AmuConfig = {};
    const workflowStart = Date.now();
    let totalRetries = 0;
    let requestUrl = endpoint;

    const execute = async (retriesLeft: number, attempt = 0): Promise<Response> => {
      const config = {
        ...this.defaults,
        ...options,
        headers: { ...this.defaults.headers, ...options.headers },
        hooks: { ...this.defaults.hooks, ...options.hooks },
      };
      finalConfig = config;
      const requestMethod = (config.method ?? 'GET').toString().toUpperCase();

      const url = appendQueryParams(
        endpoint,
        this.defaults.baseURL,
        options.params,
        options.paramsSerializer ?? this.defaults.paramsSerializer
      );
      requestUrl = url;

      if (options.json) {
        config.body = JSON.stringify(options.json);
      }

      this.updateLoading(1);
      const timeoutController = new AbortController();
      const combinedController = new AbortController();
      const userSignal = config.signal;
      let didTimeout = false;
      const onTimeoutAbort = () => {
        combinedController.abort(timeoutController.signal.reason);
      };
      const onUserAbort = () => {
        combinedController.abort(userSignal?.reason);
      };

      timeoutController.signal.addEventListener('abort', onTimeoutAbort, { once: true });
      userSignal?.addEventListener('abort', onUserAbort, { once: true });

      if (timeoutController.signal.aborted) {
        onTimeoutAbort();
      }
      if (userSignal?.aborted) {
        onUserAbort();
      }

      const timer = setTimeout(() => {
        didTimeout = true;
        timeoutController.abort();
      }, config.timeout);

      try {
        const response = await fetch(url, { ...config, signal: combinedController.signal });
        clearTimeout(timer);
        if (!response.ok) {
          const errorData = await this.parseResponseBody(response);
          throw new AmuError(response.status, errorData, response.headers, response.statusText);
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
          totalRetries += 1;
          this.safeInvoke(() =>
            config.hooks?.onRetry?.({
              attempt: attempt + 1,
              maxAttempts: retryPolicy.attempts + 1,
              delay: delayMs,
              error: normalizedError,
              reason: this.toRetryReason(normalizedError),
              method: requestMethod,
              url,
            })
          );
          await sleep(delayMs);
          return execute(retriesLeft - 1, attempt + 1);
        }

        if (totalRetries > 0) {
          this.safeInvoke(() =>
            config.hooks?.onRetryComplete?.({
              success: false,
              totalAttempts: attempt + 1,
              totalRetries,
              totalDuration: Date.now() - workflowStart,
              error: normalizedError,
              method: requestMethod,
              url,
            })
          );
        }
        throw normalizedError;
      } finally {
        timeoutController.signal.removeEventListener('abort', onTimeoutAbort);
        userSignal?.removeEventListener('abort', onUserAbort);
        this.updateLoading(-1);
      }
    };

    const responsePromise = execute(retryPolicy.attempts)
      .then((response) => {
        const totalDuration = Date.now() - workflowStart;
        const totalAttempts = totalRetries + 1;
        this.logLatency(finalConfig, {
          method: (finalConfig.method ?? 'GET').toString().toUpperCase(),
          url: requestUrl,
          duration: totalDuration,
          attempts: totalAttempts,
          status: response.status,
        });
        if (totalRetries > 0) {
          this.safeInvoke(() =>
            finalConfig.hooks?.onRetryComplete?.({
              success: true,
              totalAttempts,
              totalRetries,
              totalDuration,
              finalStatus: response.status,
              method: (finalConfig.method ?? 'GET').toString().toUpperCase(),
              url: requestUrl,
            })
          );
        }
        return response;
      })
      .catch((error: unknown) => {
        this.logLatency(finalConfig, {
          method: (finalConfig.method ?? 'GET').toString().toUpperCase(),
          url: requestUrl,
          duration: Date.now() - workflowStart,
          attempts: totalRetries + 1,
          error,
        });
        throw error;
      });

    const parsedPromise = responsePromise.then(async (res: Response) => {
      const data = await this.parseResponseBody(res, true);
      const parsedData = options.schema ? await this.validateWithSchema<T>(options.schema, data) : (data as T);
      if (!options.raw) return parsedData;

      return {
        data: parsedData,
        status: res.status,
        statusText: res.statusText,
        headers: this.toRawHeaders(res.headers),
        config: finalConfig,
        request: res,
      } as AmuRawResponse<T>;
    }) as AmuPromise<T | AmuRawResponse<T>>;

    parsedPromise.json = async <R = unknown>() => (await responsePromise).clone().json() as Promise<R>;
    parsedPromise.text = async () => (await responsePromise).clone().text();
    parsedPromise.blob = async () => (await responsePromise).clone().blob();

    return parsedPromise;
  }

  get<T = unknown>(url: string, config?: AmuConfig) {
    return this.request<T>(url, { ...config, method: 'GET' });
  }

  head<T = unknown>(url: string, config?: AmuConfig) {
    return this.request<T>(url, { ...config, method: 'HEAD' });
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
