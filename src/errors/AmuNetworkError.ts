export type AmuNetworkErrorKind = 'network' | 'timeout' | 'abort' | 'unknown';

export class AmuNetworkError extends Error {
  public readonly kind: AmuNetworkErrorKind;
  public readonly isRetryable: boolean;
  public readonly cause: unknown;

  constructor(kind: AmuNetworkErrorKind, isRetryable: boolean, cause: unknown) {
    super(`Network request failed (${kind})`);
    this.name = 'AmuNetworkError';
    this.kind = kind;
    this.isRetryable = isRetryable;
    this.cause = cause;
  }
}
