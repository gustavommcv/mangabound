import { describe, expect, it } from 'vitest';

import {
  applyMappingCommand,
  createMappingHistory,
  dispatchMappingCommand,
  redoMappingCommand,
  undoMappingCommand,
  type MappingCommand,
} from '@/domain/mapping-editor';
import { createMappingDraft } from '@/domain/mapping';

const draft = createMappingDraft({
  mangaTitle: 'History',
  chapters: [
    { id: 'c1', name: 'Chapter 1', path: '/c1', pageCount: 1, chapter: 1 },
    { id: 'c2', name: 'Chapter 2', path: '/c2', pageCount: 1, chapter: 2 },
    { id: 'c3', name: 'Chapter 3', path: '/c3', pageCount: 1, chapter: 3 },
  ],
});

describe('mapping editor history', () => {
  it('dispatches every edit through one undoable command boundary', () => {
    const commands: readonly MappingCommand[] = [
      { type: 'add-volume', id: 'v1', number: '1' },
      { type: 'add-volume', id: 'v2', number: '2' },
      { type: 'assign-chapters', volumeId: 'v1', chapterIds: ['c1', 'c2'] },
      { type: 'assign-range', volumeId: 'v2', firstChapterId: 'c2', lastChapterId: 'c3' },
      { type: 'unassign-chapters', chapterIds: ['c1'] },
      { type: 'renumber-volume', volumeId: 'v2', number: '3' },
      {
        type: 'split-volume',
        volumeId: 'v2',
        firstChapterId: 'c3',
        newVolumeId: 'v3',
        newVolumeNumber: '4',
      },
      { type: 'merge-volumes', targetVolumeId: 'v1', sourceVolumeId: 'v2' },
      { type: 'remove-volume', volumeId: 'v3' },
    ];

    let history = createMappingHistory(draft);
    for (const command of commands) history = dispatchMappingCommand(history, command);

    expect(history.past).toHaveLength(commands.length);
    expect(history.future).toEqual([]);
    expect(history.present.volumes).toMatchObject([{ id: 'v1', chapterIds: ['c2'] }]);

    const undone = undoMappingCommand(history);
    expect(undone.present.volumes.map((volume) => volume.id)).toEqual(['v1', 'v3']);
    expect(undone.future).toHaveLength(1);
    const redone = redoMappingCommand(undone);
    expect(redone.present).toEqual(history.present);
  });

  it('returns the same history when there is nothing to undo or redo', () => {
    const history = createMappingHistory(draft);

    expect(undoMappingCommand(history)).toBe(history);
    expect(redoMappingCommand(history)).toBe(history);
  });

  it('clears redo history when a new command branches from an undone state', () => {
    const first = dispatchMappingCommand(createMappingHistory(draft), {
      type: 'add-volume',
      id: 'v1',
      number: '1',
    });
    const undone = undoMappingCommand(first);
    const branch = dispatchMappingCommand(undone, { type: 'add-volume', id: 'v2', number: '2' });

    expect(branch.future).toEqual([]);
    expect(branch.present.volumes[0]?.id).toBe('v2');
  });

  it('applies commands without requiring a history wrapper', () => {
    expect(
      applyMappingCommand(draft, { type: 'add-volume', id: 'standalone', number: '1' }).volumes,
    ).toHaveLength(1);
  });
});
