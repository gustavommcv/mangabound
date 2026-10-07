import { describe, expect, it } from 'vitest';

import type { PipelineIssue } from '@/domain/conversion';
import { onlyLinksNote, skippedLinkNames, skippedLinksNotice } from '@/domain/library-links';

const issue = (code: string, extra: Partial<PipelineIssue> = {}): PipelineIssue => ({
  tool: 'mangabind',
  severity: 'warning',
  code,
  stage: 'inspect',
  recoverable: true,
  message: 'x',
  ...extra,
});

describe('skippedLinkNames', () => {
  it('is the name of each link mangabind did not follow, from the path it reported', () => {
    expect(
      skippedLinkNames([
        issue('link_skipped', { path: '/home/me/Library/Berserk' }),
        issue('link_skipped', { path: 'C:\\Manga\\Library\\Vagabond Deluxe' }),
        issue('link_skipped', { path: '/home/me/Library/第一巻/' }),
      ]),
    ).toEqual(['Berserk', 'Vagabond Deluxe', '第一巻']);
  });

  it('leaves out a link inside a manga, which is told with its book, and every other issue', () => {
    expect(
      skippedLinkNames([
        issue('link_skipped', {
          path: '/home/me/Library/Berserk/Vol.01 Ch.001/002.png',
          manga: 'Berserk',
          volume: '1',
          chapter: '1',
        }),
        issue('unparsed_chapter', { path: '/home/me/Library/Omake' }),
        issue('no_volumes_produced'),
        issue('link_skipped'),
        issue('link_skipped', { path: '' }),
        issue('link_skipped', { path: '/' }),
      ]),
    ).toEqual([]);
  });

  it('is nothing for nothing', () => {
    expect(skippedLinkNames([])).toEqual([]);
  });
});

describe('skippedLinksNotice', () => {
  it('says that one folder was not read, why, and what to do', () => {
    expect(skippedLinksNotice(['Berserk'])).toEqual({
      title: '1 folder in this library was not read',
      advice:
        'It is a link, and mangabind does not follow links to a series. Put the real folder in the library, or add it on its own:',
      names: 'Berserk',
    });
  });

  it('counts the folders, and names only the first few of many', () => {
    expect(skippedLinksNotice(['A', 'B'])).toMatchObject({
      title: '2 folders in this library were not read',
      advice:
        'They are links, and mangabind does not follow links to a series. Put the real folders in the library, or add each on its own:',
      names: 'A, B',
    });
    expect(skippedLinksNotice(['A', 'B', 'C', 'D', 'E']).names).toBe('A, B, C and 2 more');
  });
});

describe('onlyLinksNote', () => {
  it('tells a folder whose only manga is a link why it holds none', () => {
    expect(onlyLinksNote(['Berserk'])).toBe(
      'A folder in it is a link, and mangabind does not follow links to a series, so it was not read: Berserk. Put the real folder in the library and add it again.',
    );
  });

  it('tells it for several, naming the first few', () => {
    expect(onlyLinksNote(['A', 'B', 'C', 'D'])).toBe(
      '4 folders in it are links, and mangabind does not follow links to a series, so they were not read: A, B, C and 1 more. Put the real folders in the library and add it again.',
    );
  });
});
