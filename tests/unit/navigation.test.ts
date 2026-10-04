import { describe, expect, it } from 'vitest';

import type { QueueRow } from '@/domain/input-queue';
import { resolveNavigation, type WorkflowNavigation } from '@/renderer/lib/navigation';

const library: QueueRow = {
  id: 'library',
  kind: 'library',
  displayName: 'Manga Library',
  displayPath: 'D:\\Manga',
  state: 'inspected',
  sessionId: 'session-library',
  confirmed: false,
  titles: [
    {
      title: 'Good Manga',
      draft: { mangaTitle: 'Good Manga', chapters: [], volumes: [] },
      volumes: [],
    },
  ],
};
const folder: QueueRow = {
  id: 'folder',
  kind: 'folder',
  displayName: 'Offline Work',
  displayPath: 'D:\\Offline Work',
  state: 'inspected',
  sessionId: 'session-folder',
  confirmed: false,
};
const reading: QueueRow = { ...folder, id: 'reading', state: 'inspecting' } as QueueRow;
const unreadable: QueueRow = {
  ...folder,
  id: 'broken',
  state: 'unreadable',
  message: 'No.',
} as QueueRow;
const rows = [library, folder, reading, unreadable];

const queue: WorkflowNavigation = { screen: 'queue' };

describe('resolveNavigation', () => {
  it.each(['queue', 'options', 'running', 'results'] as const)(
    'leaves the %s screen alone, whatever is in the queue',
    (screen) => {
      expect(resolveNavigation({ screen }, [])).toEqual({ screen });
      expect(resolveNavigation({ screen }, rows)).toEqual({ screen });
    },
  );

  describe('the library screen', () => {
    it('stays while its library is in the queue and has been read', () => {
      const navigation: WorkflowNavigation = { screen: 'library', rowId: 'library' };

      expect(resolveNavigation(navigation, rows)).toBe(navigation);
    });

    it('is the queue when the library was removed, or the queue cleared', () => {
      expect(resolveNavigation({ screen: 'library', rowId: 'library' }, [folder])).toEqual(queue);
      expect(resolveNavigation({ screen: 'library', rowId: 'library' }, [])).toEqual(queue);
    });

    it('is the queue when the row has no titles, or is not read', () => {
      const withoutTitles = { ...library, titles: undefined } as QueueRow;

      expect(resolveNavigation({ screen: 'library', rowId: 'library' }, [withoutTitles])).toEqual(
        queue,
      );
      expect(resolveNavigation({ screen: 'library', rowId: 'reading' }, rows)).toEqual(queue);
      expect(resolveNavigation({ screen: 'library', rowId: 'broken' }, rows)).toEqual(queue);
    });
  });

  describe.each(['mapping', 'details'] as const)('the %s screen', (screen) => {
    it('stays for a folder that has been read', () => {
      const navigation: WorkflowNavigation = { screen, target: { kind: 'input', rowId: 'folder' } };

      expect(resolveNavigation(navigation, rows)).toBe(navigation);
    });

    it('stays for a title of a library that holds it', () => {
      const navigation: WorkflowNavigation = {
        screen,
        target: { kind: 'title', rowId: 'library', title: 'Good Manga' },
      };

      expect(resolveNavigation(navigation, rows)).toBe(navigation);
    });

    it('is the queue when the folder was removed, or is not read', () => {
      const removed: WorkflowNavigation = { screen, target: { kind: 'input', rowId: 'folder' } };

      expect(resolveNavigation(removed, [])).toEqual(queue);
      expect(
        resolveNavigation({ screen, target: { kind: 'input', rowId: 'reading' } }, rows),
      ).toEqual(queue);
      expect(
        resolveNavigation({ screen, target: { kind: 'input', rowId: 'broken' } }, rows),
      ).toEqual(queue);
    });

    it('is the queue when the library no longer holds the title, or the row has no titles at all', () => {
      expect(
        resolveNavigation(
          { screen, target: { kind: 'title', rowId: 'library', title: 'Gone' } },
          rows,
        ),
      ).toEqual(queue);
      expect(
        resolveNavigation(
          { screen, target: { kind: 'title', rowId: 'folder', title: 'Good Manga' } },
          rows,
        ),
      ).toEqual(queue);
      expect(
        resolveNavigation(
          { screen, target: { kind: 'title', rowId: 'library', title: 'Good Manga' } },
          [],
        ),
      ).toEqual(queue);
    });
  });
});
