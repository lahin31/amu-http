/**
 * Contract tests for Standard Schema interop. Today only Zod is exercised at
 * runtime (it's the validator most users will reach for). The same code path
 * works for Valibot 0.31+ and ArkType 2+ — they all expose `~standard`.
 *
 * These tests verify:
 *   1. Sync schemas validate.
 *   2. Async schemas validate (Standard Schema spec is async-aware).
 *   3. Validation issues come back as `AmuValidationError.issues` with shape.
 *   4. Schema transforms (e.g. Zod's `.transform()`) work end-to-end.
 *   5. Discriminated unions narrow correctly at runtime.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validateSchema } from '@/middleware/validate';
import { isStandardSchema } from '@/types/standard-schema';

describe('Standard Schema interop (Zod)', () => {
  it('detects Zod schemas via ~standard property', () => {
    const Schema = z.object({ id: z.number() });
    expect(isStandardSchema(Schema)).toBe(true);
  });

  it('validates a sync schema', async () => {
    const User = z.object({ id: z.number(), name: z.string() });
    const result = await validateSchema(User, { id: 1, name: 'Ada' });
    expect(result).toEqual({ ok: true, value: { id: 1, name: 'Ada' } });
  });

  it('returns issues on sync failure', async () => {
    const User = z.object({ id: z.number() });
    const result = await validateSchema(User, { id: 'wrong' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.message).toBeTypeOf('string');
    }
  });

  it('handles async refinements', async () => {
    const Email = z.string().refine(async (v) => Promise.resolve(v.includes('@')));
    const ok = await validateSchema(Email, 'a@b.c');
    expect(ok.ok).toBe(true);

    const bad = await validateSchema(Email, 'no-at-sign');
    expect(bad.ok).toBe(false);
  });

  it('applies schema transforms', async () => {
    const TimestampToDate = z.string().transform((s) => new Date(s));
    const result = await validateSchema(TimestampToDate, '2026-01-01T00:00:00Z');
    if (result.ok) {
      expect(result.value).toBeInstanceOf(Date);
    } else {
      throw new Error('expected ok');
    }
  });

  it('narrows discriminated unions', async () => {
    const Event = z.discriminatedUnion('type', [
      z.object({ type: z.literal('click'), x: z.number() }),
      z.object({ type: z.literal('keydown'), key: z.string() }),
    ]);
    const click = await validateSchema(Event, { type: 'click', x: 10 });
    expect(click).toEqual({ ok: true, value: { type: 'click', x: 10 } });

    const bad = await validateSchema(Event, { type: 'unknown' });
    expect(bad.ok).toBe(false);
  });
});

describe('Legacy schema fallback (no ~standard)', () => {
  it('uses .parse() if available', async () => {
    const legacy = {
      parse(input: unknown) {
        if (typeof input !== 'string') throw new Error('not a string');
        return input.toUpperCase();
      },
    };
    const ok = await validateSchema(legacy, 'hi');
    expect(ok).toEqual({ ok: true, value: 'HI' });

    const bad = await validateSchema(legacy, 123);
    expect(bad.ok).toBe(false);
  });

  it('uses pure validator function if neither ~standard nor parse', async () => {
    const guard = (input: unknown) => {
      if (typeof input !== 'number') throw new Error('not a number');
      return input * 2;
    };
    const ok = await validateSchema(guard, 21);
    expect(ok).toEqual({ ok: true, value: 42 });

    const bad = await validateSchema(guard, 'no');
    expect(bad.ok).toBe(false);
  });
});
