export class AmuValidationError extends Error {
  public readonly data: unknown;
  public readonly issues?: unknown;

  constructor(message: string, data: unknown, issues?: unknown) {
    super(message);
    this.name = 'AmuValidationError';
    this.data = data;
    this.issues = issues;
  }
}
