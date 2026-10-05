import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { app, dialog } from 'electron';
import { z } from 'zod';

import type { PendingBook, PendingRun } from '@/adapters/library/fs-pending-runs';
import { PendingSaveError, pendingSaveMessage, saveWithUniqueName } from '@/library/pending-save';
import {
  identifierSchema,
  type PendingRunSummary,
  type SaveAllResult,
  type WorkflowResult,
} from '@/shared/workflow-contract';

import type { MainContext } from '../context';
import { handle, ignoredPayloadSchema } from './handle';
import { discardRefusal, runOfSelection, wrongExtension } from './pending-decisions';
import { rememberSaveFolder } from './remembered-folders';
import { failed, ok } from './result';

type PendingContext = Pick<
  MainContext,
  | 'pendingRuns'
  | 'selectedLibraries'
  | 'pendingArtifacts'
  | 'artifactPaths'
  | 'lastPickerFolder'
  | 'lastSaveFolder'
  | 'preferences'
  | 'currentPreferences'
  | 'preferredNetworkInterface'
  | 'activeSharingTarget'
  | 'activeJobs'
  | 'pendingRunActivity'
>;
const idsSchema = z.array(identifierSchema).min(1).max(1000);
function saveFailure(error: unknown): {
  code: string;
  message: string;
} {
  if (!(error instanceof PendingSaveError))
    console.error('A pending book could not be saved.', error);
  return { code: 'save_failed', message: pendingSaveMessage(error) };
}
async function findBook(
  context: PendingContext,
  id: string,
): Promise<{
  run: PendingRun;
  book: PendingBook;
}> {
  const reference = context.pendingArtifacts.get(id);
  if (reference === undefined || context.pendingRuns === undefined)
    throw new PendingSaveError('book_unavailable', 'This pending book is no longer available.');
  const run = (await context.pendingRuns.list()).find(
    (candidate) => candidate.id === reference.runId,
  );
  const book = run?.books.find(
    (candidate) => candidate.entry.relativePath === reference.relativePath,
  );
  if (run === undefined || book === undefined)
    throw new PendingSaveError('book_unavailable', 'This pending book is no longer available.');
  return { run, book };
}
async function saveBook(
  context: PendingContext,
  id: string,
  destination: string,
  overwrite: boolean,
): Promise<string | undefined> {
  const { run, book } = await findBook(context, id);
  const refusal = wrongExtension(book.entry.format, destination);
  if (refusal !== undefined) throw refusal;
  if (context.pendingRuns === undefined) throw new Error('Pending storage is unavailable.');
  const outcome = await context.pendingRuns.exportAndRecord(run, book, destination, overwrite);
  context.artifactPaths.set(id, destination);
  rememberSaveFolder(context, path.dirname(destination));
  if (outcome.status === 'saved') return undefined;
  console.error('Could not finish recording an exported pending book.', outcome.cause);
  return outcome.status === 'catalog_failed'
    ? 'The book was copied, but its destination catalog could not be updated. Choose another folder or check its permissions, then retry; the pending copy is safe.'
    : 'The book was copied, but Mangabound could not remember that it was saved. Its pending copy remains available to retry.';
}
/** Native save dialogs and persistent pending-book recovery. Paths never cross the preload bridge. */
export function registerPendingHandlers(context: PendingContext): void {
  handle('pending:create', ignoredPayloadSchema, async (): Promise<WorkflowResult<string>> => {
    if (context.pendingRuns === undefined) throw new Error('Pending storage is unavailable.');
    const run = await context.pendingRuns.create();
    context.selectedLibraries.set(run.id, run.path);
    return ok(run.id);
  });
  handle(
    'pending:list',
    ignoredPayloadSchema,
    async (): Promise<WorkflowResult<readonly PendingRunSummary[]>> => {
      if (context.pendingRuns === undefined) throw new Error('Pending storage is unavailable.');
      const runs = await context.pendingRuns.list();
      return ok(
        runs.map((run) => {
          context.selectedLibraries.set(run.id, run.path);
          return {
            libraryId: run.id,
            createdAt: run.createdAt,
            artifacts: run.books.map((book) => {
              let id = [...context.pendingArtifacts].find(
                ([, reference]) =>
                  reference.runId === run.id && reference.relativePath === book.entry.relativePath,
              )?.[0];
              if (id === undefined) {
                id = randomUUID();
                context.pendingArtifacts.set(id, {
                  runId: run.id,
                  relativePath: book.entry.relativePath,
                });
              }
              context.artifactPaths.set(id, book.savedPath ?? book.path);
              return {
                id,
                name: path.basename(book.path),
                bytes: book.entry.bytes,
                format: book.entry.format,
                saved: book.savedPath !== undefined,
              };
            }),
          };
        }),
      );
    },
    (error: unknown) => {
      console.error('Could not recover pending books.', error);
      return {
        code: 'pending_unreadable',
        message:
          'Pending books could not be loaded. Their files were not deleted; check storage permissions and try restarting Mangabound.',
      };
    },
  );
  handle(
    'pending:discard',
    identifierSchema,
    async (_event, id): Promise<WorkflowResult<undefined>> => {
      if (context.pendingRuns === undefined) throw new Error('Pending storage is unavailable.');
      const refusal = discardRefusal({
        sharingReadyBooks: context.activeSharingTarget?.readyBooks === true,
        activeJobs: context.activeJobs.size,
      });
      if (refusal !== undefined) return failed(refusal);
      const release = context.pendingRunActivity.beginDelete(id);
      if (release === undefined) {
        return failed({
          code: 'pending_in_use',
          message: 'Wait for this pending run to finish saving before deleting it.',
        });
      }
      try {
        if (!(await context.pendingRuns.discard(id))) {
          return failed({
            code: 'pending_not_found',
            message:
              'These pending books are no longer available. Reopen Mangabound to refresh the list.',
          });
        }
        context.selectedLibraries.delete(id);
        for (const [artifactId, reference] of context.pendingArtifacts) {
          if (reference.runId !== id) continue;
          context.pendingArtifacts.delete(artifactId);
          context.artifactPaths.delete(artifactId);
        }
        return ok(undefined);
      } finally {
        release();
      }
    },
    (error: unknown) => {
      console.error('Could not delete pending books.', error);
      return {
        code: 'pending_delete_failed',
        message: 'The pending books could not be deleted. Check storage permissions and try again.',
      };
    },
  );
  handle(
    'pending:save-as',
    identifierSchema,
    async (
      _event,
      id,
    ): Promise<
      WorkflowResult<{
        saved: boolean;
        warning?: string;
      }>
    > => {
      const reference = context.pendingArtifacts.get(id);
      if (reference === undefined)
        throw new PendingSaveError('book_unavailable', 'This pending book is no longer available.');
      const release = context.pendingRunActivity.beginExport(reference.runId);
      if (release === undefined)
        throw new PendingSaveError('run_deleting', 'This pending book is being deleted.');
      try {
        const { book } = await findBook(context, id);
        const defaultFolder = context.lastSaveFolder ?? app.getPath('documents');
        const result = await dialog.showSaveDialog({
          title: 'Save book as',
          defaultPath: path.join(defaultFolder, path.basename(book.path)),
          filters: [{ name: book.entry.format.toUpperCase(), extensions: [book.entry.format] }],
        });
        // A cancelled dialog gives an empty path, so `canceled` is the whole answer.
        if (result.canceled) return ok({ saved: false });
        const warning = await saveBook(context, id, result.filePath, true);
        return ok({ saved: true, ...(warning === undefined ? {} : { warning }) });
      } finally {
        release();
      }
    },
    saveFailure,
  );
  handle(
    'pending:save-all',
    idsSchema,
    async (_event, ids): Promise<WorkflowResult<SaveAllResult | null>> => {
      const release = context.pendingRunActivity.beginExport(
        runOfSelection(ids, context.pendingArtifacts),
      );
      if (release === undefined)
        throw new PendingSaveError('run_deleting', 'This pending book is being deleted.');
      try {
        const result = await dialog.showOpenDialog({
          title: 'Save all books to a folder',
          properties: ['openDirectory', 'createDirectory'],
          defaultPath: context.lastSaveFolder ?? app.getPath('documents'),
        });
        const folder = result.filePaths[0];
        if (result.canceled || folder === undefined) return ok(null);
        rememberSaveFolder(context, folder);
        const savedIds: string[] = [];
        const failures: {
          id: string;
          message: string;
        }[] = [];
        for (const id of ids) {
          try {
            const { book } = await findBook(context, id);
            const warning = await saveWithUniqueName(path.basename(book.path), (name) =>
              saveBook(context, id, path.join(folder, name), false),
            );
            savedIds.push(id);
            if (warning !== undefined) failures.push({ id, message: warning });
          } catch (error) {
            failures.push({ id, message: saveFailure(error).message });
          }
        }
        return ok({ savedIds, failures });
      } finally {
        release();
      }
    },
    saveFailure,
  );
}
