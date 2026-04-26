export class AmuUrlError extends Error {
  public readonly input: string;
  public readonly suggestion?: string;

  constructor(input: string, suggestion?: string) {
    const message = suggestion
      ? `Invalid URL "${input}". Did you mean "${suggestion}"?`
      : `Invalid URL "${input}".`;
    super(message);
    this.name = 'AmuUrlError';
    this.input = input;
    this.suggestion = suggestion;
  }
}
