import { describe, expect, it } from 'vitest';

import { withBindingWarnings } from '@/application/workflows/binding-warnings';
import type { ConversionArtifact, PipelineIssue } from '@/domain/conversion';

const book = (name: string, extra: Partial<ConversionArtifact> = {}): ConversionArtifact => ({
  id: name,
  name,
  path: `/books/${name}`,
  bytes: 1,
  format: 'epub',
  title: name,
  author: 'Unknown',
  ...extra,
});

const issue = (code: string, extra: Partial<PipelineIssue> = {}): PipelineIssue => ({
  tool: 'mangabind',
  severity: 'warning',
  code,
  stage: 'group',
  recoverable: true,
  message: `${code} happened.`,
  ...extra,
});

describe('withBindingWarnings', () => {
  const volumes = [book('Vol.01'), book('Vol.02'), book('Vol.03')];

  it('hands the books back untouched when the joining step said nothing that matters', () => {
    expect(withBindingWarnings(volumes, [1, 2, 3], [])).toBe(volumes);
    expect(
      withBindingWarnings(
        volumes,
        [1, 2, 3],
        [
          issue('unassigned_chapter', { volume: '1' }),
          // A file the person did not write in the app: the app writes the mapping itself.
          issue('metadata_duplicate_chapter', { stage: 'metadata' }),
          issue('a_code_from_a_later_mangabind'),
        ],
      ),
    ).toBe(volumes);
  });

  it('gives a note that names a volume to that volume’s book alone', () => {
    const result = withBindingWarnings(
      volumes,
      [1, 2, 3],
      [issue('chapter_conflict', { volume: '2', message: 'Volume 2 chapter 5 has 2 sources.' })],
    );

    expect(result[0]).toBe(volumes[0]);
    expect(result[1]?.warnings).toEqual([
      { code: 'chapter_conflict', message: 'Volume 2 chapter 5 has 2 sources.' },
    ]);
    expect(result[2]).toBe(volumes[2]);
  });

  it('tells apart volumes that are not whole numbers', () => {
    const result = withBindingWarnings(
      [book('Vol.01'), book('Vol.01.5')],
      [1, 1.5],
      [issue('chapter_gap', { volume: '1.5' })],
    );

    expect(result[0]).toEqual(book('Vol.01'));
    expect(result[1]?.warnings).toHaveLength(1);
  });

  it('gives a link that was not followed to the book of the volume it was in', () => {
    const result = withBindingWarnings(
      volumes,
      [1, 2, 3],
      [
        issue('link_skipped', {
          stage: 'inspect',
          volume: '3',
          chapter: '12',
          message: 'found a link "002.png" that leads outside the input folder, skipped',
        }),
      ],
    );

    expect(result[0]).toBe(volumes[0]);
    expect(result[1]).toBe(volumes[1]);
    expect(result[2]?.warnings).toEqual([
      {
        code: 'link_skipped',
        message: 'found a link "002.png" that leads outside the input folder, skipped',
      },
    ]);
  });

  it.each([
    [
      'unsupported_page_files',
      'chapter "Vol.02 Ch.9": skipped 1 file that is not an image: "x.txt"',
    ],
    ['page_entries_too_large', 'chapter "Vol.02 Ch.9": skipped 1 page that expands to 300 MiB'],
  ])(
    'gives a page that was left out of a chapter (%s) to the book of its volume',
    (code, message) => {
      const result = withBindingWarnings(
        volumes,
        [1, 2, 3],
        [issue(code, { stage: 'inspect', volume: '2', chapter: '9', message })],
      );

      expect(result[0]).toBe(volumes[0]);
      expect(result[1]?.warnings).toEqual([{ code, message }]);
      expect(result[2]).toBe(volumes[2]);
    },
  );

  it('gives a note that names no volume to every book', () => {
    const result = withBindingWarnings(volumes, [1, 2, 3], [issue('empty_chapter')]);

    expect(result.map((entry) => entry.warnings?.map(({ code }) => code))).toEqual([
      ['empty_chapter'],
      ['empty_chapter'],
      ['empty_chapter'],
    ]);
  });

  it('gives every note to a series bound as one book, whatever volume it names', () => {
    const result = withBindingWarnings(
      [book('Series')],
      [undefined],
      [issue('chapter_conflict', { volume: '4' }), issue('chapter_gap', { volume: '7' })],
    );

    expect(result[0]?.warnings?.map(({ code }) => code)).toEqual([
      'chapter_conflict',
      'chapter_gap',
    ]);
  });

  it('adds to what the book already carries from mangapress, after it', () => {
    const withOwn = [
      book('Vol.01', { warnings: [{ code: 'images_smaller_than_device', message: 'Small.' }] }),
    ];

    const result = withBindingWarnings(withOwn, [1], [issue('chapter_gap')]);

    expect(result[0]?.warnings?.map(({ code }) => code)).toEqual([
      'images_smaller_than_device',
      'chapter_gap',
    ]);
  });

  it('keeps only the code and the sentence of a note, none of what the tool knew about where', () => {
    const result = withBindingWarnings(
      [book('Series')],
      [undefined],
      [issue('chapter_conflict', { path: '/secret/chapter', diagnostic: 'details', manga: 'M' })],
    );

    expect(result[0]?.warnings).toEqual([
      { code: 'chapter_conflict', message: 'chapter_conflict happened.' },
    ]);
  });
});
