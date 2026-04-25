export class AmuError extends Error {
  public readonly status: number;
  public readonly data: unknown;
  public readonly headers: Headers;

  constructor(status: number, data: unknown, headers: Headers, message?: string) {
    super(message || `Request failed with status ${status}`);
    this.name = 'AmuError';
    this.status = status;
    this.data = data;
    this.headers = headers;
  }
}
