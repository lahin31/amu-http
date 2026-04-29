/**
 * Discriminator for transport-layer failures. Eight kinds, exhaustively narrowable.
 *
 *   dns            DNS resolution failed
 *   connect        TCP connect failed
 *   tls            TLS handshake failed
 *   timeout-idle   socket idle timeout (read/write hung)
 *   timeout-active our timeout middleware fired
 *   abort          user-triggered AbortSignal
 *   reset          connection reset / EPIPE
 *   unknown        anything we couldn't classify
 */
export type AmuNetworkErrorKind =
  | 'dns'
  | 'connect'
  | 'tls'
  | 'timeout-idle'
  | 'timeout-active'
  | 'abort'
  | 'reset'
  | 'unknown';

/**
 * Thrown when the request fails before producing a response.
 * The discriminated `kind` lets callers retry / log / fall back precisely.
 */
export class AmuNetworkError extends Error {
  public override readonly name = 'AmuNetworkError' as const;
  public readonly kind: AmuNetworkErrorKind;
  public readonly isRetryable: boolean;
  public override readonly cause: unknown;

  constructor(kind: AmuNetworkErrorKind, isRetryable: boolean, cause: unknown) {
    super(`Network request failed (${kind})`);
    this.kind = kind;
    this.isRetryable = isRetryable;
    this.cause = cause;
  }
}
