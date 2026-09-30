import { describe, expect, it } from 'vitest';

import {
  detailsForBook,
  hasBookDetails,
  isLanguageTag,
  noBookDetails,
  normalizeBookDetails,
  persistableDetails,
  volumeBookTitle,
  volumeLabel,
} from '@/domain/book-details';

describe('normalizeBookDetails', () => {
  it('trims each field and drops the ones left blank', () => {
    expect(normalizeBookDetails({ title: '  Chainsaw Man ', author: '', language: '   ' })).toEqual(
      { title: 'Chainsaw Man' },
    );
    expect(normalizeBookDetails({ author: ' Fujimoto Tatsuki', language: 'pt-br ' })).toEqual({
      author: 'Fujimoto Tatsuki',
      language: 'pt-br',
    });
  });

  it('leaves nothing for no details', () => {
    expect(normalizeBookDetails(noBookDetails)).toEqual({});
    expect(normalizeBookDetails({ title: undefined })).toEqual({});
  });

  it('cannot be changed by whoever holds the empty details', () => {
    expect(Object.isFrozen(noBookDetails)).toBe(true);
  });
});

describe('hasBookDetails', () => {
  it('is true only when something real was typed', () => {
    expect(hasBookDetails(undefined)).toBe(false);
    expect(hasBookDetails({})).toBe(false);
    expect(hasBookDetails({ title: '   ' })).toBe(false);
    expect(hasBookDetails({ author: 'Someone' })).toBe(true);
  });
});

describe('volumeLabel', () => {
  it.each([
    [1, '01'],
    [9, '09'],
    [12, '12'],
    [100, '100'],
    [0, '00'],
    [1.5, '1.5'],
    [10.25, '10.25'],
  ])('writes volume %s the way mangabind names its files: %s', (volume, label) => {
    expect(volumeLabel(volume)).toBe(label);
  });
});

describe('volumeBookTitle', () => {
  it('names a volume of a series in the shape mangabind gives its files', () => {
    expect(volumeBookTitle('Chainsaw Man', 3)).toBe('Chainsaw Man - Vol.03');
    expect(volumeBookTitle('Chainsaw Man', 3.5)).toBe('Chainsaw Man - Vol.3.5');
  });
});

describe('detailsForBook', () => {
  const typed = { title: ' Chainsaw Man ', author: 'Fujimoto Tatsuki', language: 'pt-br' };

  it('makes a series title the title of one volume of it', () => {
    expect(detailsForBook(typed, 2)).toEqual({
      title: 'Chainsaw Man - Vol.02',
      author: 'Fujimoto Tatsuki',
      language: 'pt-br',
    });
  });

  it('keeps the title as it stands for a book that is not one volume of a series', () => {
    expect(detailsForBook(typed)).toEqual({
      title: 'Chainsaw Man',
      author: 'Fujimoto Tatsuki',
      language: 'pt-br',
    });
  });

  it('adds nothing where nothing was typed', () => {
    expect(detailsForBook(noBookDetails, 2)).toEqual({});
    expect(detailsForBook({ author: 'Someone' }, 2)).toEqual({ author: 'Someone' });
  });
});

describe('isLanguageTag', () => {
  it.each(['en', 'pt-br', 'en-US', 'zh-Hans-CN', 'jpn'])('accepts %s', (tag) => {
    expect(isLanguageTag(tag)).toBe(true);
  });

  it.each(['', 'e', 'en_US', 'not a tag', 'pt-', '-br', 'english-language-tag-too-long'])(
    'refuses %j',
    (tag) => {
      expect(isLanguageTag(tag)).toBe(false);
    },
  );
});

describe('persistableDetails', () => {
  it('keeps the author and the language, cleaned up, and never the title', () => {
    expect(
      persistableDetails({ title: 'A run title', author: ' Fujimoto Tatsuki ', language: 'pt-br' }),
    ).toEqual({ author: 'Fujimoto Tatsuki', language: 'pt-br' });
  });

  it('leaves out what is blank, and is empty for a title alone', () => {
    expect(persistableDetails({ title: 'Only a title', author: '  ' })).toEqual({});
    expect(persistableDetails({ language: 'ja' })).toEqual({ language: 'ja' });
    expect(persistableDetails(noBookDetails)).toEqual({});
  });
});
