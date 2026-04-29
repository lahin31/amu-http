import { AmuValidationError } from '@/errors/AmuValidationError';
import { defineMiddleware, type Middleware } from '@/types/middleware';
import type { Schema } from '@/types/public';
import { isStandardSchema, type StandardSchemaV1 } from '@/types/standard-schema';

/**
 * Validate `data` against `schema`. Standard Schema (Zod 3.24+, Valibot 0.31+,
 * ArkType 2+) is preferred. Falls back to `.parse` and pure validator functions.
 * Always async — Standard Schema validators may be sync OR async.
 *
 * Returns `{ ok: true, value }` or `{ ok: false, issues }`.
 */
export async function validateSchema<T>(
  schema: Schema<T>,
  input: unknown,
): Promise<{ ok: true; value: T } | { ok: false; issues: ReadonlyArray<StandardSchemaV1.Issue> }> {
  if (isStandardSchema(schema)) {
    const result = await schema['~standard'].validate(input);
    if (result.issues) {
      return { ok: false, issues: result.issues };
    }
    return { ok: true, value: result.value as T };
  }

  if (typeof schema === 'object' && schema !== null && 'parse' in schema) {
    try {
      const value = await (schema as { parse: (i: unknown) => T | Promise<T> }).parse(input);
      return { ok: true, value };
    } catch (err) {
      return { ok: false, issues: extractIssues(err) };
    }
  }

  if (typeof schema === 'function') {
    try {
      const value = await schema(input);
      return { ok: true, value };
    } catch (err) {
      return { ok: false, issues: extractIssues(err) };
    }
  }

  // Unknown schema shape — pass through unchanged. Type-system already returns `unknown` here.
  return { ok: true, value: input as T };
}

function extractIssues(err: unknown): ReadonlyArray<StandardSchemaV1.Issue> {
  if (typeof err === 'object' && err !== null && 'issues' in err) {
    const issues = (err as { issues: unknown }).issues;
    if (Array.isArray(issues)) return issues as ReadonlyArray<StandardSchemaV1.Issue>;
  }
  if (err instanceof Error) {
    return [{ message: err.message }];
  }
  return [{ message: String(err) }];
}

/**
 * Built-in middleware: validate the response body against `meta.responseSchema`.
 * Sits inside `parse` so it only sees successful responses (2xx). On failure
 * throws `AmuValidationError` carrying both raw data and structured issues.
 */
export const validate: Middleware = defineMiddleware(
  'validate',
  async (ctx, next) => {
    const res = await next(ctx);
    const schema = ctx.meta['responseSchema'];
    if (!schema) return res;
    const result = await validateSchema(schema as Schema<unknown>, res.data);
    if (!result.ok) {
      throw new AmuValidationError(
        'response',
        'Response failed schema validation',
        res.data,
        result.issues,
      );
    }
    return { ...res, data: result.value };
  },
  'middle',
);
