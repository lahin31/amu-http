import { describe, expectTypeOf, it } from 'vitest';
import amu, {
  Amu,
  AmuError,
  type AmuHybrid,
  AmuNetworkError,
  type AmuPromise,
  type AmuRawResponse,
  AmuUrlError,
  AmuValidationError,
  createInstance,
} from '@/index';

describe('public api types', () => {
  it('default export is callable as factory and has request methods', () => {
    expectTypeOf(amu).toEqualTypeOf<AmuHybrid>();
    expectTypeOf(amu.get).toBeFunction();
    expectTypeOf(amu.post).toBeFunction();
    expectTypeOf(amu.put).toBeFunction();
    expectTypeOf(amu.patch).toBeFunction();
    expectTypeOf(amu.delete).toBeFunction();
    expectTypeOf(amu.request).toBeFunction();
  });

  it('factory call returns an Amu instance', () => {
    expectTypeOf(amu('https://api.example.com')).toEqualTypeOf<Amu>();
    expectTypeOf(createInstance('https://api.example.com')).toEqualTypeOf<Amu>();
    expectTypeOf(createInstance({ baseURL: 'x', timeout: 1 })).toEqualTypeOf<Amu>();
  });

  it('get<T>() resolves to T (no .data wrapper) by default', async () => {
    type User = { id: number; name: string };
    const promise = amu.get<User>('/u/1');
    expectTypeOf(promise).toMatchTypeOf<AmuPromise<User>>();
    expectTypeOf(await promise).toEqualTypeOf<User>();
  });

  it('get<T>() with raw:true resolves to AmuRawResponse<T>', async () => {
    type User = { id: number };
    const client = new Amu();
    const res = await client.request<User>('/u/1', { raw: true });
    expectTypeOf(res).toEqualTypeOf<AmuRawResponse<User>>();
    expectTypeOf(res.data).toEqualTypeOf<User>();
    expectTypeOf(res.status).toEqualTypeOf<number>();
    expectTypeOf(res.headers).toEqualTypeOf<Record<string, string>>();
  });

  it('AmuPromise<T> exposes .json/.text/.blob escape hatches', () => {
    const promise = amu.get<{ ok: boolean }>('/ping');
    expectTypeOf(promise.json).toBeFunction();
    expectTypeOf(promise.text).toBeFunction();
    expectTypeOf(promise.blob).toBeFunction();
    expectTypeOf(promise.text()).resolves.toEqualTypeOf<string>();
    expectTypeOf(promise.blob()).resolves.toEqualTypeOf<Blob>();
  });

  it('error classes are constructable values, not type-only', () => {
    expectTypeOf(AmuError).toBeConstructibleWith(404, null, new Headers());
    expectTypeOf(AmuNetworkError).toBeConstructibleWith('network', true, new Error());
    expectTypeOf(AmuUrlError).toBeConstructibleWith('bad-url');
    expectTypeOf(AmuValidationError).toBeConstructibleWith('msg', null);
  });

  it('AmuError carries structured fields', () => {
    const err = new AmuError(500, { msg: 'x' }, new Headers());
    expectTypeOf(err.status).toEqualTypeOf<number>();
    expectTypeOf(err.data).toBeUnknown();
    expectTypeOf(err.headers).toEqualTypeOf<Headers>();
  });
});
