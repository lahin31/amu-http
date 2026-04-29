import { describe, expectTypeOf, it } from 'vitest';
import type { InferUrlParams } from '@/types/infer';
import type { RouteParams } from '@/types/public';

describe('InferUrlParams', () => {
  it('extracts a single :name param', () => {
    expectTypeOf<InferUrlParams<'/users/:id'>>().toEqualTypeOf<{
      readonly id: string | number;
    }>();
  });

  it('extracts multiple :name params', () => {
    expectTypeOf<InferUrlParams<'/users/:id/posts/:postId'>>().toEqualTypeOf<{
      readonly id: string | number;
      readonly postId: string | number;
    }>();
  });

  it('returns never for paths with no :name placeholders', () => {
    expectTypeOf<InferUrlParams<'/users'>>().toBeNever;
  });

  it('handles trailing param at end of string', () => {
    expectTypeOf<InferUrlParams<'/u/:id'>>().toEqualTypeOf<{
      readonly id: string | number;
    }>();
  });

  it('RouteParams is a re-export of InferUrlParams', () => {
    expectTypeOf<RouteParams<'/u/:id'>>().toEqualTypeOf<InferUrlParams<'/u/:id'>>();
  });
});
