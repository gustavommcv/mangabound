import { describe, expect, it } from 'vitest';

import {
  carryStoredDetails,
  readStoredDetails,
  withStoredDetails,
} from '@/adapters/mangabind/stored-details';

const file = (document: unknown): string => `${JSON.stringify(document, null, 2)}\n`;

describe('reading the details kept in a mangabind.json', () => {
  it('finds the author and language under manga', () => {
    expect(
      readStoredDetails(
        file({
          schema_version: 1,
          manga: { title: 'Chainsaw Man', author: ' Fujimoto Tatsuki ', language: 'pt-br' },
          volumes: [],
        }),
      ),
    ).toEqual({ author: 'Fujimoto Tatsuki', language: 'pt-br' });
  });

  it.each([
    ['is not JSON', 'not json at all'],
    ['is JSON that is not an object', '[1, 2]'],
    ['has no manga', file({ schema_version: 1, volumes: [] })],
    ['has a manga that is not an object', file({ manga: 'Chainsaw Man' })],
    ['has a manga with only a title', file({ manga: { title: 'Chainsaw Man' } })],
    ['has values that are not text', file({ manga: { author: 3, language: ['en'] } })],
    ['has blank values', file({ manga: { author: '   ', language: '' } })],
  ])('finds nothing in a file that %s', (_case, text) => {
    expect(readStoredDetails(text)).toEqual({});
  });

  it('leaves out what cannot be used: an author too long and a language that is not a tag', () => {
    expect(
      readStoredDetails(file({ manga: { author: 'x'.repeat(301), language: 'not a language' } })),
    ).toEqual({});
    expect(readStoredDetails(file({ manga: { author: 'Someone', language: 'en_US' } }))).toEqual({
      author: 'Someone',
    });
  });
});

describe('carrying the details over when the mapping is saved', () => {
  const mapping = file({
    schema_version: 1,
    manga: { title: 'Chainsaw Man' },
    volumes: [{ number: '1', chapters: ['1-7'] }],
  });

  it('keeps the author and language of the file that is replaced', () => {
    const existing = file({
      schema_version: 1,
      manga: { title: 'Old name', author: 'Fujimoto Tatsuki', language: 'pt-br' },
      volumes: [],
    });

    expect(JSON.parse(carryStoredDetails(existing, mapping))).toEqual({
      schema_version: 1,
      manga: { title: 'Chainsaw Man', author: 'Fujimoto Tatsuki', language: 'pt-br' },
      volumes: [{ number: '1', chapters: ['1-7'] }],
    });
  });

  it('adds a manga to a mapping that had none', () => {
    const noManga = file({ schema_version: 1, volumes: [] });
    const existing = file({ manga: { author: 'Someone' } });

    expect(JSON.parse(carryStoredDetails(existing, noManga))).toEqual({
      schema_version: 1,
      volumes: [],
      manga: { author: 'Someone' },
    });
  });

  it.each([
    ['there is no file yet', undefined],
    ['the file holds no details', file({ manga: { title: 'X' } })],
    ['the file is not JSON', 'nope'],
  ])('writes the mapping as it is when %s', (_case, existing) => {
    expect(carryStoredDetails(existing, mapping)).toBe(mapping);
  });
});

describe('keeping the details with a folder', () => {
  it('starts a file when there is none, with no volumes, since none were asked for', () => {
    const text = withStoredDetails(undefined, {
      title: 'Not kept',
      author: ' Fujimoto Tatsuki ',
      language: 'pt-br',
    });

    expect(JSON.parse(text ?? '')).toEqual({
      schema_version: 1,
      manga: { author: 'Fujimoto Tatsuki', language: 'pt-BR' },
      volumes: [],
    });
    expect(text?.endsWith('\n')).toBe(true);
  });

  it('changes only the author and language of a file that has a mapping', () => {
    const existing = file({
      schema_version: 1,
      manga: { title: 'Chainsaw Man', author: 'Old', language: 'ja' },
      volumes: [{ number: '1', chapters: ['1-7'] }],
      source: { provider: 'mangadex', id: 'abc' },
      note: 'a key nothing here knows',
    });

    const text = withStoredDetails(existing, { author: 'New', language: 'pt-br' });

    expect(JSON.parse(text ?? '')).toEqual({
      schema_version: 1,
      manga: { title: 'Chainsaw Man', author: 'New', language: 'pt-BR' },
      volumes: [{ number: '1', chapters: ['1-7'] }],
      source: { provider: 'mangadex', id: 'abc' },
      note: 'a key nothing here knows',
    });
  });

  it('forgets what was cleared, and keeps the rest of the file', () => {
    const existing = file({
      schema_version: 1,
      manga: { title: 'Chainsaw Man', author: 'Old', language: 'ja' },
      volumes: [{ number: '1', chapters: ['1-7'] }],
    });

    const text = withStoredDetails(existing, { title: 'only a title' });

    expect(JSON.parse(text ?? '')).toEqual({
      schema_version: 1,
      manga: { title: 'Chainsaw Man' },
      volumes: [{ number: '1', chapters: ['1-7'] }],
    });
  });

  it('does not invent a schema version for a file that had none', () => {
    const existing = file({ volumes: [{ number: '1', chapters: ['1'] }] });

    expect(JSON.parse(withStoredDetails(existing, { author: 'Someone' }) ?? '')).toEqual({
      manga: { author: 'Someone' },
      volumes: [{ number: '1', chapters: ['1'] }],
    });
  });

  it('drops the manga altogether when nothing is left of it', () => {
    const existing = file({
      schema_version: 1,
      manga: { author: 'Old' },
      volumes: [{ number: '1', chapters: ['1'] }],
    });

    expect(JSON.parse(withStoredDetails(existing, {}) ?? '')).toEqual({
      schema_version: 1,
      volumes: [{ number: '1', chapters: ['1'] }],
    });
  });

  it('leaves no file behind when it held nothing but the details, and none is made for nothing', () => {
    const only = file({ schema_version: 1, manga: { author: 'Old' }, volumes: [] });

    expect(withStoredDetails(only, {})).toBeUndefined();
    expect(withStoredDetails(undefined, {})).toBeUndefined();
    expect(withStoredDetails(undefined, { title: 'not kept' })).toBeUndefined();
  });

  it('does not throw away a file that holds something this code does not know', () => {
    const existing = file({ schema_version: 1, manga: { author: 'Old' }, volumes: [], note: 'x' });

    expect(JSON.parse(withStoredDetails(existing, {}) ?? '')).toEqual({
      schema_version: 1,
      volumes: [],
      note: 'x',
    });
  });

  it('keeps a source and a manga title even with no volumes', () => {
    const source = file({ schema_version: 1, volumes: [], source: { provider: 'p', id: 'i' } });
    const titled = file({ schema_version: 1, manga: { title: 'X', author: 'A' }, volumes: [] });

    expect(withStoredDetails(source, {})).toBeDefined();
    expect(JSON.parse(withStoredDetails(titled, {}) ?? '')).toEqual({
      schema_version: 1,
      manga: { title: 'X' },
      volumes: [],
    });
  });

  it('refuses to overwrite a file that is not JSON, or not an object', () => {
    expect(() => withStoredDetails('this is not json', { author: 'A' })).toThrow();
    expect(() => withStoredDetails('[1]', { author: 'A' })).toThrow(/not a JSON object/u);
  });
});
