import { describe, expect, it } from 'vitest';

import { warningNotices } from '@/domain/book-warnings';

const small = {
  code: 'images_smaller_than_device',
  message: '3 of 4 pages are smaller than the device. Consider --upscale (or --stretch).',
};
const converted = { code: 'source_already_converted', message: 'These pages look converted.' };

describe('the warnings of a run, as the results show them', () => {
  it('has nothing to show for books made without a warning', () => {
    expect(warningNotices([])).toEqual([]);
    expect(warningNotices([{ name: 'One.epub' }, { name: 'Two.epub', warnings: [] }])).toEqual([]);
  });

  it('says a known warning in the app’s own words, naming the option as the screen does', () => {
    const [notice] = warningNotices([{ name: 'One.epub', warnings: [small] }]);

    expect(notice).toEqual({
      code: 'images_smaller_than_device',
      title: 'Pages smaller than the screen',
      message:
        'More than a quarter of the pages are smaller than the screen and nothing enlarges them. Choose “Fit, enlarging small pages” under Page size to make them easier to read.',
    });
    // The tool's sentence names a command-line flag; a single book needs no "which book".
    expect(notice?.message).not.toContain('--upscale');
    expect(notice).not.toHaveProperty('where');
  });

  it.each([
    ['source_already_converted', 'Pages already converted once'],
    ['skipped_non_images', 'Files that are not images were left out'],
    ['spread_labels_ignored', 'A .json file beside the book was not used'],
    ['spread_labels_skipped', 'Some labelled spreads were not joined'],
    ['output_collision', 'Saved under another name'],
  ])('knows %s', (code, title) => {
    const [notice] = warningNotices([{ name: 'One.epub', warnings: [{ code, message: 'x' }] }]);
    expect(notice?.title).toBe(title);
    expect(notice?.message).not.toBe('x');
  });

  it('is one notice for a warning every book has, not one per book', () => {
    const books = ['One.epub', 'Two.epub', 'Three.epub'].map((name) => ({
      name,
      warnings: [small],
    }));

    expect(warningNotices(books)).toEqual([
      expect.objectContaining({ code: small.code, where: 'In all 3 books.' }),
    ]);
  });

  it('names the books a warning is in when it is not in all of them', () => {
    const names = ['One.epub', 'Two.epub', 'Three.epub', 'Four.epub', 'Five.epub'];
    const whereFor = (affected: number): string | undefined =>
      warningNotices(
        names.map((name, index) => (index < affected ? { name, warnings: [small] } : { name })),
      )[0]?.where;

    expect(whereFor(1)).toBe('In One.epub.');
    expect(whereFor(2)).toBe('In One.epub and Two.epub.');
    expect(whereFor(3)).toBe('In One.epub, Two.epub and 1 more.');
    expect(whereFor(4)).toBe('In One.epub, Two.epub and 2 more.');
    expect(whereFor(5)).toBe('In all 5 books.');
  });

  it('keeps the order the warnings first came in, and counts a book once', () => {
    const notices = warningNotices([
      { name: 'One.epub', warnings: [converted, converted] },
      { name: 'Two.epub', warnings: [small, converted] },
    ]);

    expect(notices.map((notice) => [notice.code, notice.where])).toEqual([
      ['source_already_converted', 'In all 2 books.'],
      ['images_smaller_than_device', 'In Two.epub.'],
    ]);
  });

  it('shows the tool’s own sentence for a code it does not know', () => {
    const later = { code: 'added_in_a_later_release', message: 'Something new was noticed.' };
    const notices = warningNotices([
      { name: 'One.epub', warnings: [later] },
      { name: 'Two.epub', warnings: [later, { ...later, message: 'Something else.' }] },
    ]);

    expect(notices).toEqual([
      {
        code: 'added_in_a_later_release',
        title: 'A note from mangapress',
        message: 'Something new was noticed.',
        where: 'In all 2 books.',
      },
      {
        code: 'added_in_a_later_release',
        title: 'A note from mangapress',
        message: 'Something else.',
        where: 'In Two.epub.',
      },
    ]);
  });
});
