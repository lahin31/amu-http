import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  type AmuAnyError,
  type AmuError,
  type AmuNetworkError,
  type AmuUnknownError,
  type AmuUrlError,
  type AmuValidationError,
  createClient,
  type Result,
} from '@/index';

const api = createClient();

describe('safe() Result API', () => {
  const User = z.object({ id: z.number() });
  type User = z.infer<typeof User>;

  it('returns Result<T> where T is inferred from schema', async () => {
    const r = await api.safe.get('https://x/u', { schema: { response: User } });
    expectTypeOf(r).toEqualTypeOf<Result<User>>();
  });

  it('narrows to data on ok=true', async () => {
    const r = await api.safe.get('https://x/u', { schema: { response: User } });
    if (r.ok) {
      expectTypeOf(r.data).toEqualTypeOf<User>();
      // @ts-expect-error — error not present in success branch
      r.error;
    }
  });

  it('narrows to AmuAnyError on ok=false', async () => {
    const r = await api.safe.get('https://x/u');
    if (!r.ok) {
      expectTypeOf(r.error).toEqualTypeOf<AmuAnyError>();
    }
  });

  it('AmuAnyError union is exhaustive across 5 classes', () => {
    function exhaust(e: AmuAnyError): string {
      switch (e.name) {
        case 'AmuError':
          expectTypeOf(e).toEqualTypeOf<AmuError>();
          return 'http';
        case 'AmuNetworkError':
          expectTypeOf(e).toEqualTypeOf<AmuNetworkError>();
          return 'network';
        case 'AmuUrlError':
          expectTypeOf(e).toEqualTypeOf<AmuUrlError>();
          return 'url';
        case 'AmuValidationError':
          expectTypeOf(e).toEqualTypeOf<AmuValidationError>();
          return 'validation';
        case 'AmuUnknownError':
          expectTypeOf(e).toEqualTypeOf<AmuUnknownError>();
          return 'unknown';
      }
    }
    expectTypeOf(exhaust).toBeFunction();
  });

  it('AmuNetworkError.kind narrows exhaustively', () => {
    function classify(e: AmuNetworkError): string {
      switch (e.kind) {
        case 'dns':
        case 'connect':
        case 'tls':
        case 'timeout-idle':
        case 'timeout-active':
        case 'abort':
        case 'reset':
        case 'unknown':
          return e.kind;
      }
    }
    expectTypeOf(classify).toBeFunction();
  });
});
