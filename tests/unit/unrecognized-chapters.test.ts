import { describe, expect, it } from 'vitest';

import type { PipelineIssue } from '@/domain/conversion';
import { unrecognizedChapterNames, unrecognizedChaptersNote } from '@/domain/unrecognized-chapters';

const issue = (code: string, extra: Partial<PipelineIssue> = {}): PipelineIssue => ({
  tool: 'mangabind',
  severity: 'warning',
  code,
  stage: 'parse',
  recoverable: true,
  message: 'x',
  ...extra,
});

describe('unrecognizedChapterNames', () => {
  it('is the name of each folder mangabind could not read, from the path it reported', () => {
    expect(
      unrecognizedChapterNames([
        issue('unparsed_chapter', { path: 'C:\\Users\\me\\Series\\Omake' }),
        issue('unparsed_chapter', { path: '/home/me/Series/Ch.004 [GroupA]' }),
        issue('unparsed_chapter', { path: '/home/me/Series/第11話/' }),
      ]),
    ).toEqual(['Omake', 'Ch.004 [GroupA]', '第11話']);
  });

  it('leaves out every other kind of issue, and one that names no path', () => {
    expect(
      unrecognizedChapterNames([
        issue('unassigned_chapter', { path: '/home/me/Series/Ch.1' }),
        issue('chapter_conflict', { path: '/home/me/Series/Ch.2' }),
        issue('unparsed_chapter'),
        issue('unparsed_chapter', { path: '' }),
        issue('unparsed_chapter', { path: '/' }),
      ]),
    ).toEqual([]);
  });

  it('is nothing for nothing', () => {
    expect(unrecognizedChapterNames([])).toEqual([]);
  });
});

describe('unrecognizedChaptersNote', () => {
  it('says nothing when every folder was read', () => {
    expect(unrecognizedChaptersNote([])).toBe('');
  });

  it('says which folder, that it is left out, and what to do about it', () => {
    expect(unrecognizedChaptersNote(['Omake'])).toBe(
      'A folder has a name mangabind cannot read as a chapter, so it is left out of the books: Omake. Rename it to include a chapter number (Ch.005, for one), then add the folder again.',
    );
  });

  it('names up to three folders', () => {
    expect(unrecognizedChaptersNote(['A', 'B', 'C'])).toBe(
      '3 folders have a name mangabind cannot read as a chapter, so they are left out of the books: A, B, C. Rename them to include a chapter number (Ch.005, for one), then add the folder again.',
    );
  });

  it('counts the rest instead of listing them', () => {
    expect(unrecognizedChaptersNote(['A', 'B', 'C', 'D', 'E'])).toContain(': A, B, C and 2 more.');
    expect(unrecognizedChaptersNote(['A', 'B', 'C', 'D'])).toContain(': A, B, C and 1 more.');
  });
});
