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
    ['the file only holds what the mapping makes', mapping],
  ])('writes the mapping as it is when %s', (_case, existing) => {
    expect(carryStoredDetails(existing, mapping)).toBe(mapping);
  });

  it.each([
    ['is not JSON', 'nope'],
    ['is an empty file', ''],
    ['is JSON that is not an object', '[1, 2]'],
    ['is a bare number', '3'],
    ['is null', 'null'],
  ])(
    'refuses to overwrite a file that %s, which is not the app\u2019s to destroy',
    (_case, existing) => {
      expect(() => carryStoredDetails(existing, mapping)).toThrow();
    },
  );

  describe('keeps what the person or another tool keeps in the file', () => {
    const hand = {
      schema_version: 1,
      my_notes: 'kept by me',
      manga: { title: 'Series', author: 'Old', anilist_id: 12345, tags: ['a', 'b'] },
      volumes: [
        { number: '1', chapters: ['1', '2'], note: 'first arc' },
        { number: '2', chapters: ['3'], note: 'second arc' },
      ],
      source: { provider: 'mangadex', id: 'abc' },
    };
    const remade = (volumes: unknown, extra: Record<string, unknown> = {}) =>
      file({ schema_version: 1, manga: { title: 'Series' }, volumes, ...extra });

    it('keeps a key of its own at the top, and every key under manga', () => {
      const written = JSON.parse(
        carryStoredDetails(file(hand), remade([{ number: '1', chapters: ['1', '2', '3'] }])),
      ) as typeof hand;

      expect(written.my_notes).toBe('kept by me');
      expect(written.manga).toEqual({
        title: 'Series',
        author: 'Old',
        anilist_id: 12345,
        tags: ['a', 'b'],
      });
    });

    it('keeps a key on a volume that is still there, and replaces its chapters', () => {
      const written = JSON.parse(
        carryStoredDetails(
          file(hand),
          remade([
            { number: '1', chapters: ['1', '2', '3'] },
            { number: '2', chapters: ['4'] },
          ]),
        ),
      ) as typeof hand;

      expect(written.volumes).toEqual([
        { number: '1', chapters: ['1', '2', '3'], note: 'first arc' },
        { number: '2', chapters: ['4'], note: 'second arc' },
      ]);
    });

    it('lets go of the notes of a volume that is not there any more, and keeps those of a new one empty', () => {
      const written = JSON.parse(
        carryStoredDetails(
          file(hand),
          remade([
            { number: '2', chapters: ['3'] },
            { number: '3', chapters: ['9'] },
          ]),
        ),
      ) as typeof hand;

      expect(written.volumes).toEqual([
        { number: '2', chapters: ['3'], note: 'second arc' },
        { number: '3', chapters: ['9'] },
      ]);
    });

    it('keeps the source when the mapping names none, and takes the one it names', () => {
      const without = JSON.parse(
        carryStoredDetails(file(hand), remade([{ number: '1', chapters: ['1'] }])),
      ) as typeof hand;
      const with_ = JSON.parse(
        carryStoredDetails(
          file(hand),
          remade([{ number: '1', chapters: ['1'] }], { source: { provider: 'other', id: 'z' } }),
        ),
      ) as typeof hand;

      expect(without.source).toEqual({ provider: 'mangadex', id: 'abc' });
      expect(with_.source).toEqual({ provider: 'other', id: 'z' });
    });

    it('keeps the file in the order it had, with what is new after it', () => {
      const written = carryStoredDetails(
        file(hand),
        remade([{ number: '1', chapters: ['1'] }], { extra_from_mapping: true }),
      );

      expect(Object.keys(JSON.parse(written) as object)).toEqual([
        'schema_version',
        'my_notes',
        'manga',
        'volumes',
        'source',
        'extra_from_mapping',
      ]);
    });

    it('takes a volume in the file that has no number, or a file whose volumes are not a list, for nothing', () => {
      const odd = file({ volumes: [{ chapters: ['1'] }, 'text'], note: 'x' });
      const alsoOdd = file({ volumes: 'none', note: 'y' });
      const one = remade([{ number: '1', chapters: ['1'] }]);

      expect((JSON.parse(carryStoredDetails(odd, one)) as { note: string }).note).toBe('x');
      expect(
        JSON.parse(carryStoredDetails(alsoOdd, one)) as { volumes: unknown[]; note: string },
      ).toMatchObject({ note: 'y', volumes: [{ number: '1', chapters: ['1'] }] });
    });

    it('lays a mapping that has no volumes over the file without losing the rest', () => {
      const written = JSON.parse(
        carryStoredDetails(file({ my_notes: 'mine', volumes: [] }), file({ schema_version: 1 })),
      ) as Record<string, unknown>;

      expect(written).toEqual({ my_notes: 'mine', volumes: [], schema_version: 1 });
    });

    it('takes a mapping that is not a list of volumes as it comes', () => {
      const written = JSON.parse(
        carryStoredDetails(file({ my_notes: 'mine' }), file({ schema_version: 1, volumes: 'x' })),
      ) as Record<string, unknown>;

      expect(written).toMatchObject({ my_notes: 'mine', volumes: 'x' });
    });
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
