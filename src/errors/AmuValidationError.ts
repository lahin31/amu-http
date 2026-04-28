import type { StandardSchemaV1 } from '@/types/standard-schema';

/**
 * Thrown when schema validation fails — either on the outgoing request body
 * (caught locally before send) or on the incoming response body.
 */
export class AmuValidationError extends Error {
  public override readonly name = 'AmuValidationError' as const;
  public readonly target: 'request' | 'response';
  public readonly data: unknown;
  public readonly issues: ReadonlyArray<StandardSchemaV1.Issue>;

  constructor(
    target: 'request' | 'response',
    message: string,
    data: unknown,
    issues: ReadonlyArray<StandardSchemaV1.Issue>,
  ) {
    super(message);
    this.target = target;
    this.data = data;
    this.issues = issues;
  }
}
