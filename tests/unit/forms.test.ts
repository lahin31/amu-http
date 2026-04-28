import { describe, expect, it } from 'vitest';
import { formData, urlEncoded } from '@/forms/index';

describe('formData()', () => {
  it('builds a FormData with scalar values', () => {
    const fd = formData({ name: 'Ada', age: 36, active: true });
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get('name')).toBe('Ada');
    expect(fd.get('age')).toBe('36');
    expect(fd.get('active')).toBe('true');
  });

  it('appends arrays as multiple entries', () => {
    const fd = formData({ tags: ['a', 'b', 'c'] });
    expect(fd.getAll('tags')).toEqual(['a', 'b', 'c']);
  });

  it('drops null and undefined entries', () => {
    const fd = formData({ a: 'x', b: null, c: undefined, d: 'y' });
    expect(fd.has('b')).toBe(false);
    expect(fd.has('c')).toBe(false);
    expect(fd.get('a')).toBe('x');
    expect(fd.get('d')).toBe('y');
  });

  it('passes Blob through', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const fd = formData({ file: blob });
    expect(fd.get('file')).toBeInstanceOf(Blob);
  });
});

describe('urlEncoded()', () => {
  it('builds URLSearchParams', () => {
    const usp = urlEncoded({ a: 1, b: 'two', c: true });
    expect(usp).toBeInstanceOf(URLSearchParams);
    expect(usp.toString()).toBe('a=1&b=two&c=true');
  });

  it('appends arrays as repeated keys', () => {
    const usp = urlEncoded({ tags: ['a', 'b'] });
    expect(usp.getAll('tags')).toEqual(['a', 'b']);
    expect(usp.toString()).toBe('tags=a&tags=b');
  });

  it('drops null and undefined', () => {
    const usp = urlEncoded({ a: 'x', b: null, c: undefined });
    expect(usp.has('b')).toBe(false);
    expect(usp.has('c')).toBe(false);
    expect(usp.toString()).toBe('a=x');
  });
});
