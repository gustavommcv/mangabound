import { describe, expect, it, vi } from 'vitest';

import { droppedPaths } from '@/preload/dropped-paths';

const pathOf = (file: unknown): string => (typeof file === 'string' ? `/dropped/${file}` : '');

describe('droppedPaths', () => {
  it('gives the path of each dropped file, in the order they were dropped', () => {
    expect(droppedPaths(['a.cbz', 'b.cbz', 'c.cbz'], pathOf)).toEqual([
      '/dropped/a.cbz',
      '/dropped/b.cbz',
      '/dropped/c.cbz',
    ]);
    expect(droppedPaths([], pathOf)).toEqual([]);
  });

  it('leaves what is not a file to the one that reads the path', () => {
    const read = vi.fn(pathOf);

    expect(droppedPaths(['a.cbz', 42, undefined, { name: 'x' }], read)).toEqual([
      '/dropped/a.cbz',
      '',
      '',
      '',
    ]);
    expect(read).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'a.cbz'],
    ['a number', 3],
    ['a plain object', {}],
    ['an array-like object', { length: 1, 0: 'a.cbz' }],
    ['a Set', new Set(['a.cbz'])],
  ])('reads nothing from %s', (_name, value) => {
    const read = vi.fn(pathOf);

    expect(droppedPaths(value, read)).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });

  it('does not let the page choose the paths with a map of its own', () => {
    const chosen = { map: () => ['/etc', '/root'] };
    const read = vi.fn(pathOf);

    expect(droppedPaths(chosen, read)).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });

  it('does not run a map, an iterator or a length that the page put on a real array', () => {
    const dropped = Object.assign(['a.cbz', 'b.cbz'], {
      map: () => ['/etc'],
      [Symbol.iterator]: function* evil() {
        yield '/root';
      },
    });

    expect(droppedPaths(dropped, pathOf)).toEqual(['/dropped/a.cbz', '/dropped/b.cbz']);
  });
});
