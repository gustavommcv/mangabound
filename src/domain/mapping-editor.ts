import {
  addVolume,
  assignChapterRange,
  assignChapters,
  mergeVolumes,
  type MappingDraft,
  removeVolume,
  renumberVolume,
  splitVolume,
  unassignChapters,
} from './mapping';

export type MappingCommand =
  | { readonly type: 'add-volume'; readonly id: string; readonly number: string }
  | { readonly type: 'remove-volume'; readonly volumeId: string }
  | { readonly type: 'renumber-volume'; readonly volumeId: string; readonly number: string }
  | {
      readonly type: 'assign-chapters';
      readonly volumeId: string;
      readonly chapterIds: readonly string[];
    }
  | {
      readonly type: 'assign-range';
      readonly volumeId: string;
      readonly firstChapterId: string;
      readonly lastChapterId: string;
    }
  | { readonly type: 'unassign-chapters'; readonly chapterIds: readonly string[] }
  | {
      readonly type: 'split-volume';
      readonly volumeId: string;
      readonly firstChapterId: string;
      readonly newVolumeId: string;
      readonly newVolumeNumber: string;
    }
  | {
      readonly type: 'merge-volumes';
      readonly targetVolumeId: string;
      readonly sourceVolumeId: string;
    };

export interface MappingEditorHistory {
  readonly past: readonly MappingDraft[];
  readonly present: MappingDraft;
  readonly future: readonly MappingDraft[];
}

export function createMappingHistory(draft: MappingDraft): MappingEditorHistory {
  return { past: [], present: draft, future: [] };
}

export function applyMappingCommand(draft: MappingDraft, command: MappingCommand): MappingDraft {
  switch (command.type) {
    case 'add-volume':
      return addVolume(draft, command.id, command.number);
    case 'remove-volume':
      return removeVolume(draft, command.volumeId);
    case 'renumber-volume':
      return renumberVolume(draft, command.volumeId, command.number);
    case 'assign-chapters':
      return assignChapters(draft, command.volumeId, command.chapterIds);
    case 'assign-range':
      return assignChapterRange(
        draft,
        command.volumeId,
        command.firstChapterId,
        command.lastChapterId,
      );
    case 'unassign-chapters':
      return unassignChapters(draft, command.chapterIds);
    case 'split-volume':
      return splitVolume(
        draft,
        command.volumeId,
        command.firstChapterId,
        command.newVolumeId,
        command.newVolumeNumber,
      );
    case 'merge-volumes':
      return mergeVolumes(draft, command.targetVolumeId, command.sourceVolumeId);
  }
}

export function dispatchMappingCommand(
  history: MappingEditorHistory,
  command: MappingCommand,
): MappingEditorHistory {
  return {
    past: [...history.past, history.present],
    present: applyMappingCommand(history.present, command),
    future: [],
  };
}

export function undoMappingCommand(history: MappingEditorHistory): MappingEditorHistory {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoMappingCommand(history: MappingEditorHistory): MappingEditorHistory {
  const next = history.future[0];
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}
