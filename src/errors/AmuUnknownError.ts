/**
 * Catch-all for non-amu errors thrown inside middleware (programming bugs).
 * Surfaced via `safe()` so the Result union stays exhaustive.
 *
 * If you see this in production, a middleware threw something that isn't one of
 * the four amu error classes. Inspect `cause` for the original.
 */
export class AmuUnknownError extends Error {
  public override readonly name = 'AmuUnknownError' as const;
  public override readonly cause: unknown;

  constructor(cause: unknown, message?: string) {
    super(message ?? 'Unexpected error inside amu middleware');
    this.cause = cause;
  }
}
