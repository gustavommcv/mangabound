import path from 'node:path';

import type { BookFormat } from '@/domain/conversion';
import { PendingSaveError } from '@/library/pending-save';
import type { WorkflowFailure } from '@/shared/workflow-contract';

/** Which book of which pending run an id the page holds stands for. */
export interface PendingReference {
  readonly runId: string;
  readonly relativePath: string;
}

const extension: Readonly<Record<BookFormat, string>> = { epub: '.epub', cbz: '.cbz', pdf: '.pdf' };

/**
 * The run that every selected book belongs to. Save All is one action on one run: the page names
 * books by the ids it was given, and an id it repeats, one this app never gave or one of another
 * run is refused before anything is asked of the person.
 */
export function runOfSelection(
  ids: readonly string[],
  references: ReadonlyMap<string, PendingReference>,
): string {
  if (new Set(ids).size !== ids.length) throw new Error('A book was selected more than once.');
  const selected = ids.map((id) => references.get(id));
  const first = selected[0];
  if (
    first === undefined ||
    selected.some((reference) => reference === undefined || reference.runId !== first.runId)
  ) {
    throw new Error('Select books from one conversion at a time.');
  }
  return first.runId;
}

/**
 * Why a pending run cannot be deleted right now, or `undefined` when it can: its books are being
 * shared, or a conversion is running, which could be making books in it.
 */
export function discardRefusal(state: {
  readonly runId: string;
  readonly sharingRunId: string | undefined;
  readonly activeJobs: number;
}): WorkflowFailure | undefined {
  if (state.sharingRunId === state.runId) {
    return {
      code: 'pending_in_use',
      message: 'Stop sharing these books before deleting their pending copies.',
    };
  }
  if (state.activeJobs > 0) {
    return {
      code: 'pending_in_use',
      message: 'Wait for the current conversion to finish before deleting pending books.',
    };
  }
  return undefined;
}

/** The refusal of a destination whose extension is not the one of the book's own format. */
export function wrongExtension(
  format: BookFormat,
  destination: string,
): PendingSaveError | undefined {
  return path.extname(destination).toLowerCase() === extension[format]
    ? undefined
    : new PendingSaveError('wrong_extension', `Choose a ${extension[format]} file for this book.`);
}
