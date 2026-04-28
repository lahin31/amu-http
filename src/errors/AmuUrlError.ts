/**
 * Thrown for malformed URLs caught before any network activity. Includes a
 * suggestion for common typos like `https:google.com` → `https://google.com`.
 */
export class AmuUrlError extends Error {
  public override readonly name = 'AmuUrlError' as const;
  public readonly input: string;
  public readonly suggestion?: string;

  constructor(input: string, suggestion?: string) {
    super(
      suggestion
        ? `Invalid URL "${input}". Did you mean "${suggestion}"?`
        : `Invalid URL "${input}".`,
    );
    this.input = input;
    this.suggestion = suggestion;
  }
}
