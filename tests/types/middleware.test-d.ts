import { describe, expectTypeOf, it } from 'vitest';
import type { Middleware, RequestContext, ResponseContext } from '@/index';
import { defineMiddleware } from '@/index';

describe('Middleware type', () => {
  it('is a function (ctx, next) => Promise<ResponseContext>', () => {
    const mw: Middleware = async (ctx, next) => {
      expectTypeOf(ctx).toEqualTypeOf<RequestContext>();
      const res = await next(ctx);
      expectTypeOf(res).toEqualTypeOf<ResponseContext>();
      return res;
    };
    expectTypeOf(mw).toBeFunction();
  });

  it('defineMiddleware preserves the Middleware shape', () => {
    const m = defineMiddleware('test', async (ctx, next) => next(ctx), 'middle');
    expectTypeOf(m).toMatchTypeOf<Middleware>();
  });
});
