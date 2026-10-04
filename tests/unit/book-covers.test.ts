import { describe, expect, it } from 'vitest';

import {
  type AttachedCover,
  describeFolderImport,
  isCoverImage,
  planFolderImport,
} from '@/domain/book-covers';

const image = (name: string) => ({ name, path: `/covers/${name}` });

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
