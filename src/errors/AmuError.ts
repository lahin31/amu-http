/**
 * Thrown when the server returns an HTTP non-2xx response.
 */
export class AmuError extends Error {
  public override readonly name = 'AmuError' as const;
  public readonly status: number;
  public readonly statusText: string;
  public readonly data: unknown;
  public readonly headers: Headers;

  constructor(status: number, statusText: string, data: unknown, headers: Headers) {
    super(`Request failed with status ${status} ${statusText}`.trimEnd());
    this.status = status;
    this.statusText = statusText;
    this.data = data;
    this.headers = headers;
  }
}
