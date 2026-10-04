import { describe, expect, it } from 'vitest';

import {
  canonicalLanguageTag,
  clipTitle,
  detailsForBook,
  hasBookDetails,
  hasControlCharacters,
  isLanguageTag,
  maxTitleBytes,
  noBookDetails,
  normalizeBookDetails,
  persistableDetails,
  titleFits,
  volumeBookTitle,
  volumeLabel,
} from '@/domain/book-details';

describe('normalizeBookDetails', () => {
  it('trims each field and drops the ones left blank', () => {
    expect(normalizeBookDetails({ title: '  Chainsaw Man ', author: '', language: '   ' })).toEqual(
      { title: 'Chainsaw Man' },
    );
    expect(normalizeBookDetails({ author: ' Fujimoto Tatsuki', language: 'pt-BR ' })).toEqual({
      author: 'Fujimoto Tatsuki',
      language: 'pt-BR',
    });
  });

  it('writes the language the way BCP 47 recommends, however it was typed', () => {
    expect(normalizeBookDetails({ language: ' pt-br ' })).toEqual({ language: 'pt-BR' });
    expect(normalizeBookDetails({ language: 'EN-us' })).toEqual({ language: 'en-US' });
    // What is not a tag is not guessed at: it is kept as it was, and refused where it is typed.
    expect(normalizeBookDetails({ language: 'Not A Tag' })).toEqual({ language: 'Not A Tag' });
  });

  it('leaves nothing for no details', () => {
    expect(normalizeBookDetails(noBookDetails)).toEqual({});
    expect(normalizeBookDetails({ title: undefined })).toEqual({});
  });

  it('cannot be changed by whoever holds the empty details', () => {
    expect(Object.isFrozen(noBookDetails)).toBe(true);
  });
});

describe('canonicalLanguageTag', () => {
  it.each([
    ['pt-br', 'pt-BR'],
    ['PT-BR', 'pt-BR'],
    ['pt-BR', 'pt-BR'],
    ['en-us', 'en-US'],
    ['EN', 'en'],
    ['ja', 'ja'],
    ['jpn', 'jpn'],
    ['zh-hant-tw', 'zh-Hant-TW'],
    ['ZH-HANS', 'zh-Hans'],
    ['sr-latn-rs', 'sr-Latn-RS'],
    ['es-419', 'es-419'],
    ['de-1996', 'de-1996'],
    ['de-ch-1901', 'de-CH-1901'],
    ['en-oxendict', 'en-oxendict'],
  ])('writes %s as %s', (tag, written) => {
    expect(canonicalLanguageTag(tag)).toBe(written);
  });

  it.each(['', 'portuguese-language-tag', 'pt_br', 'not a tag', 'pt-', 'x'])(
    'returns %j as it is, since it is not a tag',
    (value) => {
      expect(canonicalLanguageTag(value)).toBe(value);
    },
  );

  it('does nothing to a tag already written that way', () => {
    expect(canonicalLanguageTag(canonicalLanguageTag('zh-hant-tw'))).toBe('zh-Hant-TW');
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
  const typed = { title: ' Chainsaw Man ', author: 'Fujimoto Tatsuki', language: 'pt-BR' };

  it('makes a series title the title of one volume of it', () => {
    expect(detailsForBook(typed, 2)).toEqual({
      title: 'Chainsaw Man - Vol.02',
      author: 'Fujimoto Tatsuki',
      language: 'pt-BR',
    });
  });

  it('keeps the title as it stands for a book that is not one volume of a series', () => {
    expect(detailsForBook(typed)).toEqual({
      title: 'Chainsaw Man',
      author: 'Fujimoto Tatsuki',
      language: 'pt-BR',
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
    ).toEqual({ author: 'Fujimoto Tatsuki', language: 'pt-BR' });
  });

  it('leaves out what is blank, and is empty for a title alone', () => {
    expect(persistableDetails({ title: 'Only a title', author: '  ' })).toEqual({});
    expect(persistableDetails({ language: 'ja' })).toEqual({ language: 'ja' });
    expect(persistableDetails(noBookDetails)).toEqual({});
  });
});

describe('the length of a title', () => {
  const bytes = (text: string): number => new TextEncoder().encode(text).length;

  it('is counted in bytes, since the file of a book is named after it', () => {
    expect(titleFits('a'.repeat(maxTitleBytes))).toBe(true);
    expect(titleFits('a'.repeat(maxTitleBytes + 1))).toBe(false);
    // 66 Japanese letters are 198 bytes; 67 are 201: the character count says nothing.
    expect(titleFits('あ'.repeat(66))).toBe(true);
    expect(titleFits('あ'.repeat(67))).toBe(false);
    expect(titleFits('')).toBe(true);
  });

  it('is cut at a whole character, and a title that fits is not touched', () => {
    expect(clipTitle('Chainsaw Man')).toBe('Chainsaw Man');
    expect(clipTitle('a'.repeat(300))).toBe('a'.repeat(maxTitleBytes));
    expect(clipTitle('あ'.repeat(90))).toBe('あ'.repeat(66));
    expect(clipTitle('')).toBe('');
  });

  it('is never cut in the middle of a character that takes two or more units to write', () => {
    // An emoji is four bytes and two UTF-16 units; 50 of them are exactly 200 bytes.
    expect(clipTitle('😀'.repeat(60))).toBe('😀'.repeat(50));
    expect(bytes(clipTitle('😀'.repeat(60)))).toBe(maxTitleBytes);
    // One plain letter first: 1 + 49 emoji is 197 bytes, and a 50th would be 201.
    expect(clipTitle(`a${'😀'.repeat(60)}`)).toBe(`a${'😀'.repeat(49)}`);
  });

  it('is cut when the details are kept, and the cut title does not end in a space', () => {
    const cut = normalizeBookDetails({ title: `${'a'.repeat(199)} ${'b'.repeat(10)}` }).title;

    expect(cut).toBe('a'.repeat(199));
    expect(normalizeBookDetails({ title: 'あ'.repeat(90) }).title).toBe('あ'.repeat(66));
  });
});

describe('control characters in the details', () => {
  const nul = String.fromCharCode(0);

  it('are found, and ordinary text with accents and spaces has none', () => {
    expect(hasControlCharacters(`a${nul}b`)).toBe(true);
    expect(hasControlCharacters('a\nb')).toBe(true);
    expect(hasControlCharacters('a\tb')).toBe(true);
    expect(hasControlCharacters('Mangá São José — ほげ')).toBe(false);
    expect(hasControlCharacters('')).toBe(false);
  });

  it('become spaces when the details are kept, so a pasted title or a looked-up name still works', () => {
    expect(
      normalizeBookDetails({ title: `Chainsaw${nul}Man`, author: 'Fujimoto\nTatsuki' }),
    ).toEqual({
      title: 'Chainsaw Man',
      author: 'Fujimoto Tatsuki',
    });
    // Only a control character: nothing is left, which is the same as nothing typed.
    expect(normalizeBookDetails({ title: `${nul}${nul}`, author: '\n' })).toEqual({});
  });
});
