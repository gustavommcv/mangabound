import { describe, expect, it } from 'vitest';

import { uniqueFileName } from '@/library/unique-name';

const none = (): boolean => false;
const takenAmong = (names: readonly string[]) => (candidate: string) => names.includes(candidate);

describe('uniqueFileName', () => {
  it('keeps a name nothing else has', () => {
    expect(uniqueFileName('Chainsaw Man - Vol.01.epub', none)).toBe('Chainsaw Man - Vol.01.epub');
  });

  it('numbers a name that is taken, before the extension, starting at 2', () => {
    expect(uniqueFileName('Volume 1.epub', takenAmong(['Volume 1.epub']))).toBe(
      'Volume 1 (2).epub',
    );
  });

  it('skips the numbers that are taken too', () => {
    const taken = takenAmong(['Volume 1.epub', 'Volume 1 (2).epub', 'Volume 1 (3).epub']);
    expect(uniqueFileName('Volume 1.epub', taken)).toBe('Volume 1 (4).epub');
  });

  it('numbers only after the last dot, so dots inside the name stay', () => {
    expect(uniqueFileName('Vol.01.5.cbz', takenAmong(['Vol.01.5.cbz']))).toBe('Vol.01.5 (2).cbz');
  });

  it('numbers a name with no extension, and a name that is only an extension', () => {
    expect(uniqueFileName('Volume', takenAmong(['Volume']))).toBe('Volume (2)');
    expect(uniqueFileName('.epub', takenAmong(['.epub']))).toBe('.epub (2)');
  });

  it('lets the caller decide what counts as taken', () => {
    const caseInsensitive = (candidate: string) => candidate.toLowerCase() === 'volume 1.epub';
    expect(uniqueFileName('Volume 1.EPUB', caseInsensitive)).toBe('Volume 1 (2).EPUB');
  });
});
