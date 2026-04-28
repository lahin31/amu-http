import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { Client } from '@/index';
import { createClient } from '@/index';

const api: Client = createClient();

describe('schema inference', () => {
  const User = z.object({ id: z.number(), name: z.string() });
  type User = z.infer<typeof User>;

  it('returns inferred type when schema.response is provided', async () => {
    const u = await api.get('https://x/u/1', { schema: { response: User } });
    expectTypeOf(u).toEqualTypeOf<User>();
  });

  it('returns unknown when no schema is provided', async () => {
    const u = await api.get('https://x/u/1');
    expectTypeOf(u).toEqualTypeOf<unknown>();
  });

  it('infers POST body type from schema.body (Standard Schema)', async () => {
    const result = await api.post(
      'https://x/u',
      { id: 1, name: 'Ada' },
      { schema: { body: User, response: User } },
    );
    expectTypeOf(result).toEqualTypeOf<User>();
  });

  it('infers body and response independently', async () => {
    const Login = z.object({ email: z.string(), password: z.string() });
    const Token = z.object({ token: z.string() });

    const t = await api.post(
      'https://x/login',
      { email: 'a@b.c', password: 'pw' },
      { schema: { body: Login, response: Token } },
    );
    expectTypeOf(t).toEqualTypeOf<z.infer<typeof Token>>();
  });

  it('falls back to unknown for legacy parse-style schemas', async () => {
    const legacy = { parse: (input: unknown) => input as { custom: string } };
    const r = await api.get('https://x', { schema: { response: legacy } });
    expectTypeOf(r).toEqualTypeOf<{ custom: string }>();
  });

  it('falls back to unknown for pure validator functions', async () => {
    const fn = (input: unknown) => input as { greeting: string };
    const r = await api.get('https://x', { schema: { response: fn } });
    expectTypeOf(r).toEqualTypeOf<{ greeting: string }>();
  });
});

describe('type-safe URL params', () => {
  it('requires `params` when path has :name', () => {
    expectTypeOf(api.get<'/users/:id'>)
      .parameter(1)
      .toMatchTypeOf<{
        params: { id: string | number };
      }>();
  });

  it('does not require `params` when path has no placeholders', async () => {
    await api.get('/users');
    await api.get('/users', {});
  });

  it('extracts multiple params correctly', () => {
    expectTypeOf(api.get<'/u/:id/posts/:postId'>)
      .parameter(1)
      .toMatchTypeOf<{
        params: { id: string | number; postId: string | number };
      }>();
  });
});
