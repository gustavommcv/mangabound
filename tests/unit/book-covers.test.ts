import { describe, expect, it } from 'vitest';

import {
  type AttachedCover,
  describeFolderImport,
  isCoverImage,
  looksLikeCoverImage,
  planFolderImport,
} from '@/domain/book-covers';

const image = (name: string, readable = true) => ({ name, path: `/covers/${name}`, readable });
const bytes = (...values: (number | string)[]): Uint8Array =>
  Uint8Array.from(
    values.flatMap((value) =>
      typeof value === 'number' ? [value] : [...value].map((character) => character.charCodeAt(0)),
    ),
  );

describe('what a file that is an image begins with', () => {
  it.each([
    ['a PNG', bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13)],
    ['a JPEG', bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16, 'JFIF')],
    ['a GIF87a', bytes('GIF87a', 1, 0, 1, 0)],
    ['a GIF89a', bytes('GIF89a', 1, 0, 1, 0)],
    ['a BMP', bytes('BM', 0x36, 0, 0, 0)],
    ['a WebP', bytes('RIFF', 0x24, 0, 0, 0, 'WEBPVP8 ')],
  ])('takes %s', (_kind, head) => {
    expect(looksLikeCoverImage(head)).toBe(true);
  });

  it.each([
    ['an empty file', bytes()],
    ['text', bytes('not an image at all')],
    ['a web page', bytes('<html><head>')],
    ['half a PNG signature', bytes(0x89, 'PNG')],
    ['a JPEG signature missing its third byte', bytes(0xff, 0xd8, 0x00)],
    ['a GIF of no version', bytes('GIF90a', 1, 0)],
    ['a RIFF file that is not a WebP', bytes('RIFF', 0x24, 0, 0, 0, 'WAVEfmt ')],
    ['a WebP signature in the wrong place', bytes('WEBP', 0, 0, 0, 0, 'RIFF')],
    ['a zip archive', bytes('PK', 3, 4, 0, 0, 0, 0, 0, 0)],
  ])('does not take %s', (_kind, head) => {
    expect(looksLikeCoverImage(head)).toBe(false);
  });
});

describe('what counts as a cover image', () => {
  it.each(['a.jpg', 'a.JPEG', 'front cover.png', 'x.webp', 'x.gif', 'x.bmp'])(
    'takes %s',
    (name) => {
      expect(isCoverImage(name)).toBe(true);
    },
  );

  it.each(['notes.txt', 'cover', '.jpg', 'archive.cbz', 'cover.jpg.bak'])('leaves %s', (name) => {
    expect(isCoverImage(name)).toBe(false);
  });
});

describe('an image of a folder that cannot be read', () => {
  it('keeps its place, so the images after it still go to the books they line up with', () => {
    const plan = planFolderImport(
      [1, 2, 3],
      [],
      [image('01.jpg'), image('02.jpg', false), image('03.jpg')],
    );

    expect(plan.assignments.map((entry) => [entry.slot, entry.image.name])).toEqual([
      [1, '01.jpg'],
      [3, '03.jpg'],
    ]);
    expect(plan.unreadable).toEqual(['02.jpg']);
    expect(describeFolderImport(plan)).toBe(
      '1 image could not be read (02.jpg), so the book it falls on keeps its first page.',
    );
  });

  it('is not mentioned for a book whose cover was chosen by hand, nor beyond the last book', () => {
    const chosen: AttachedCover[] = [{ slot: 2, name: 'mine.png', origin: 'chosen' }];

    const kept = planFolderImport([1, 2], chosen, [image('a.jpg'), image('b.jpg', false)]);
    expect(kept.unreadable).toEqual([]);
    expect(kept.kept).toEqual([2]);

    const beyond = planFolderImport([1], [], [image('a.jpg'), image('b.jpg', false)]);
    expect(beyond.unreadable).toEqual([]);
    expect(beyond.unused).toBe(1);
  });

  it('names up to three, says how many more, and speaks of books in the plural', () => {
    const images = ['a', 'b', 'c', 'd', 'e'].map((name) => image(`${name}.jpg`, false));

    expect(describeFolderImport(planFolderImport([1, 2, 3, 4, 5], [], images))).toBe(
      '5 images could not be read (a.jpg, b.jpg, c.jpg and 2 more), so the books they fall on keep their first pages.',
    );
    expect(describeFolderImport(planFolderImport([1, 2], [], images.slice(0, 2)))).toBe(
      '2 images could not be read (a.jpg, b.jpg), so the books they fall on keep their first pages.',
    );
  });

  it('is said together with the rest, in the order the other notes are', () => {
    const chosen: AttachedCover[] = [{ slot: 1, name: 'mine.png', origin: 'chosen' }];
    const plan = planFolderImport([1, 2], chosen, [
      image('a.jpg'),
      image('b.jpg', false),
      image('c.jpg'),
    ]);

    expect(describeFolderImport(plan)).toBe(
      '1 book keeps the cover chosen for it. 1 image could not be read (b.jpg), so the book it falls on keeps its first page. 1 image was not used: there are 2 books.',
    );
  });
});

describe('handing the images of a folder to the books in order', () => {
  it('gives the first image to the first book, by the order a person reads names in', () => {
    const plan = planFolderImport(
      [1, 2, 3],
      [],
      [image('10.jpg'), image('2.jpg'), image('b.jpg'), image('A.jpg')].slice(0, 3),
    );

    // 2 before 10, and what was listed first on disk does not matter.
    expect(plan.assignments.map(({ slot, image: picked }) => [slot, picked.name])).toEqual([
      [1, '2.jpg'],
      [2, '10.jpg'],
      [3, 'b.jpg'],
    ]);
    expect(plan).toMatchObject({ kept: [], images: 3, unused: 0, books: 3 });
    expect(describeFolderImport(plan)).toBeUndefined();
  });

  it('never replaces a cover chosen by hand, and still lines the other images up', () => {
    const attached: AttachedCover[] = [
      { slot: 2, name: 'mine.png', origin: 'chosen' },
      { slot: 3, name: 'old-03.jpg', origin: 'folder' },
    ];

    const plan = planFolderImport([1, 2, 3], attached, [
      image('01.jpg'),
      image('02.jpg'),
      image('03.jpg'),
    ]);

    // The second image is passed over; the third still goes to the third book and replaces
    // what an earlier folder gave it.
    expect(plan.assignments.map(({ slot, image: picked }) => [slot, picked.name])).toEqual([
      [1, '01.jpg'],
      [3, '03.jpg'],
    ]);
    expect(plan.kept).toEqual([2]);
    expect(describeFolderImport(plan)).toBe('1 book keeps the cover chosen for it.');
  });

  it('says how many images lay beyond the last book', () => {
    const plan = planFolderImport(['book'], [], [image('a.jpg'), image('b.jpg'), image('c.jpg')]);

    expect(plan.assignments).toEqual([{ slot: 'book', image: image('a.jpg') }]);
    expect(plan.unused).toBe(2);
    expect(describeFolderImport(plan)).toBe('2 images were not used: there is 1 book.');
    expect(
      describeFolderImport(
        planFolderImport([1, 2], [], [image('a.jpg'), image('b.jpg'), image('c.jpg')]),
      ),
    ).toBe('1 image was not used: there are 2 books.');
  });

  it('leaves the books past the last image as they were, and says so', () => {
    const chosen: AttachedCover[] = [
      { slot: 1, name: 'mine.png', origin: 'chosen' },
      { slot: 2, name: 'mine too.png', origin: 'chosen' },
    ];

    expect(describeFolderImport(planFolderImport([1, 2, 3], [], [image('a.jpg')]))).toBe(
      'There was 1 image for 3 books; the other books are unchanged.',
    );
    expect(
      describeFolderImport(
        planFolderImport([1, 2, 3, 4], chosen, [image('a.jpg'), image('b.jpg')]),
      ),
    ).toBe(
      '2 books keep the cover chosen for them. There were 2 images for 4 books; the other books are unchanged.',
    );
  });

  it('says so when the folder holds no image at all', () => {
    const plan = planFolderImport([1, 2], [], []);

    expect(plan.assignments).toEqual([]);
    expect(describeFolderImport(plan)).toBe(
      'No image was found there. A cover has to be a JPEG, PNG, WebP, GIF or BMP image.',
    );
  });
});
