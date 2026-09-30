import { createMappingDraft } from '@/domain/mapping';
import { type MangaboundBridge } from '@/shared/runtime-info';
import { type SelectedInput } from '@/shared/workflow-contract';

import { bridge } from './workflow';

export const goodTitle = {
  title: 'Good Manga',
  draft: createMappingDraft({
    mangaTitle: 'Good Manga',
    chapters: [
      {
        id: 'g1',
        name: 'Chapter 1',
        path: 'C:\\input\\Manga Library\\Good Manga\\Chapter 1',
        pageCount: 2,
        chapter: 1,
      },
    ],
    volumes: [{ id: 'gv1', number: '1', chapterIds: ['g1'] }],
  }),
  volumes: [{ name: 'Good Manga - Vol.01.cbz', pageCount: 2 }],
  issues: [],
};
/** A title mangabind could not group: it has chapters and no volumes. */
export const looseTitle = {
  title: 'Broken Manga',
  draft: createMappingDraft({
    mangaTitle: 'Broken Manga',
    chapters: [
      {
        id: 'b1',
        name: 'Chapter 1',
        path: 'C:\\input\\Manga Library\\Broken Manga\\Chapter 1',
        pageCount: 1,
        chapter: 1,
      },
    ],
  }),
  volumes: [],
  issues: [],
};
/** The same title once it has volumes. */
export const groupedTitle = {
  ...looseTitle,
  draft: createMappingDraft({
    mangaTitle: 'Broken Manga',
    chapters: looseTitle.draft.chapters,
    volumes: [{ id: 'bv1', number: '1', chapterIds: ['b1'] }],
  }),
  volumes: [{ name: 'Broken Manga - Vol.01.cbz', pageCount: 1 }],
};

export const libraryFolder: SelectedInput = {
  selectionId: 'library-selection',
  displayName: 'Manga Library',
  displayPath: 'C:\\input\\Manga Library',
  kind: 'folder',
};

/** A bridge whose folder is a library holding these titles. */
export function libraryBridge(
  titles: readonly (typeof goodTitle)[],
  overrides: Partial<MangaboundBridge> = {},
): MangaboundBridge {
  return bridge({
    chooseInputs: () =>
      Promise.resolve({ ok: true, value: { inputs: [libraryFolder], rejected: [] } }),
    inspectInput: () =>
      Promise.resolve({
        ok: true,
        value: {
          sessionId: 'library-session',
          displayName: 'Manga Library',
          kind: 'library',
          titles,
          issues: [],
        },
      }),
    ...overrides,
  });
}

export const converted = (title: string, id: string) => ({
  title,
  status: 'done' as const,
  artifacts: [{ id, name: `${title}.epub`, bytes: 2048, format: 'epub' as const }],
});
