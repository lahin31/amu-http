import { describe, expect, it } from 'vitest';
import { serializeQuery } from '@/query';

describe('serializeQuery — flat (default)', () => {
  it('serializes scalars', () => {
    expect(serializeQuery({ a: 1, b: 'two', c: true }, undefined)).toBe('a=1&b=two&c=true');
  });

  it('drops undefined and null', () => {
    expect(serializeQuery({ a: 1, b: null, c: undefined, d: 0 }, 'flat')).toBe('a=1&d=0');
  });

  it('joins arrays with comma', () => {
    expect(serializeQuery({ ids: [1, 2, 3] }, 'flat')).toBe('ids=1%2C2%2C3');
  });

  it('returns empty string for empty input', () => {
    expect(serializeQuery({}, 'flat')).toBe('');
  });
});

describe('serializeQuery — qs (bracketed nested)', () => {
  it('flat keys behave like flat', () => {
    expect(serializeQuery({ a: 1, b: 'two' }, 'qs')).toBe('a=1&b=two');
  });

  it('nested objects use bracket syntax', () => {
    expect(serializeQuery({ filter: { status: 'active' } }, 'qs')).toBe(
      'filter%5Bstatus%5D=active',
    );
  });

  it('deeply nested objects', () => {
    expect(serializeQuery({ filter: { date: { gt: '2024-01-01' } } }, 'qs')).toBe(
      'filter%5Bdate%5D%5Bgt%5D=2024-01-01',
    );
  });

  it('arrays use empty-bracket syntax', () => {
    expect(serializeQuery({ tags: ['a', 'b'] }, 'qs')).toBe('tags%5B%5D=a&tags%5B%5D=b');
  });

  it('arrays of objects', () => {
    expect(serializeQuery({ items: [{ id: 1 }, { id: 2 }] }, 'qs')).toBe(
      'items%5B%5D%5Bid%5D=1&items%5B%5D%5Bid%5D=2',
    );
  });
});

describe('serializeQuery — custom function', () => {
  it('uses the provided serializer', () => {
    const out = serializeQuery({ a: 1, b: 2 }, (q) =>
      Object.entries(q)
        .map(([k, v]) => `${k.toUpperCase()}=${v}`)
        .join(';'),
    );
    expect(out).toBe('A=1;B=2');
  });
});
