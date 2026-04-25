import { AmuConfig, AmuPromise, AmuSchema } from '../types/public.js';
import { appendQueryParams, createDefaults, getErrorName, AmuDefaults } from '../utils/http.js';
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
      const data = contentType.includes('application/json') ? await res.json() : await res.text();
      if (!options.schema) return data as T;
      return this.validateWithSchema<T>(options.schema, data);
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
