import { AmuConfig, AmuPromise } from './types.js';
import { appendQueryParams, createDefaults, getErrorName, AmuDefaults } from './amu-utils.js';

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

  request<T = unknown>(endpoint: string, options: AmuConfig = {}): AmuPromise<T> {
    const maxRetries = options.retries ?? this.defaults.retries;

    const execute = async (retriesLeft: number): Promise<Response> => {
      const config = {
        ...this.defaults,
        ...options,
        headers: { ...this.defaults.headers, ...options.headers },
      };

      const url = appendQueryParams(endpoint, this.defaults.baseURL, options.params);

      if (options.json) {
        config.body = JSON.stringify(options.json);
      }

      this.updateLoading(1);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeout);

      try {
        const response = await fetch(url, { ...config, signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) throw { status: response.status, response };
        return response;
      } catch (err: unknown) {
        clearTimeout(timer);
        if (retriesLeft > 0 && getErrorName(err) !== 'AbortError') {
          return execute(retriesLeft - 1);
        }
        throw err;
      } finally {
        this.updateLoading(-1);
      }
    };

    const parsedPromise = execute(maxRetries).then(async (res: Response) => {
      if (res.status === 204) return null;
      const contentType = res.headers.get('content-type') || '';
      return contentType.includes('application/json') ? await res.json() : await res.text();
    }) as AmuPromise<T>;

    parsedPromise.json = async <R = unknown>() => (await execute(maxRetries)).json() as Promise<R>;
    parsedPromise.text = async () => (await execute(maxRetries)).text();
    parsedPromise.blob = async () => (await execute(maxRetries)).blob();

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
