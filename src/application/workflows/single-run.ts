import type { BindingPort, ConversionPort } from '@/application/ports/conversion-tools';
import type { CoverLookup } from '@/application/workflows/book-covers';
import {
  type BookInput,
  type BookProduction,
  withCovers,
} from '@/application/workflows/book-production';
import {
  type ActiveSession,
  type InputSessions,
  trustedMapping,
} from '@/application/workflows/input-sessions';
import {
  assertSingleBook,
  emptyBindingError,
  type RunAction,
  validateRunOptions,
} from '@/application/workflows/run-preconditions';
import { presentBindingProgress } from '@/application/workflows/binding-progress';
import { detailsForBook, noBookDetails } from '@/domain/book-details';
import {
  type ConversionArtifact,
  type ConversionProgress,
  type ConversionRequest,
  ConversionWorkflowError,
  plannedSingleBook,
  type WorkflowPlan,
} from '@/domain/conversion';
import { type ProcessMode, unsupportedModeReason, usesMangapress } from '@/domain/process-mode';

/** Plan or convert one folder or CBZ; successful conversions spend their inspected session. */
export class SingleInputRun {
  constructor(
    private readonly binding: BindingPort,
    private readonly conversion: ConversionPort,
    private readonly sessions: InputSessions,
    private readonly books: BookProduction,
    private readonly covers: CoverLookup,
  ) {}

  async convert(
    request: ConversionRequest,
    {
      onArtifact,
      onProgress,
      signal,
    }: {
      /** Called as each book lands, so a failure part-way still leaves the caller knowing which. */
      readonly onArtifact?: (artifact: ConversionArtifact) => void;
      readonly onProgress: (progress: ConversionProgress) => void;
      readonly signal?: AbortSignal;
    },
  ): Promise<readonly ConversionArtifact[]> {
    const { session, mode, singleBook } = this.assertRunnable(request, 'converting');

    const details = usesMangapress(mode) ? (request.details ?? noBookDetails) : noBookDetails;
    let inputs: readonly BookInput[];
    if (session.selection.kind === 'cbz' || mode === 'convert-only') {
      // Already one book (or explicitly not grouped): straight to mangapress, no mapping needed.
      inputs = [{ path: session.selection.inputPath }];
    } else {
      if (
        session.trustedDraft === undefined ||
        session.workspaceId === undefined ||
        request.mapping === undefined
      ) {
        throw new ConversionWorkflowError(
          'mapping_required',
          'Confirm the chapter-to-volume mapping before converting.',
        );
      }
      const mapping = trustedMapping(session.trustedDraft, request.mapping);
      onProgress({
        stage: 'binding',
        message: `Organizing ${String(mapping.chapters.length)} chapters into volume files…`,
      });
      const bound = await this.binding.bind(
        session.workspaceId,
        mapping,
        signal,
        singleBook,
        (p) => {
          onProgress(presentBindingProgress(p));
        },
      );
      if (singleBook) {
        if (bound.combinedOutputPath === undefined) {
          throw emptyBindingError('no_volumes');
        }
        inputs = [{ path: bound.combinedOutputPath }];
      } else {
        if (bound.volumes.length === 0) {
          throw emptyBindingError('no_volumes');
        }
        inputs = bound.volumes.map((volume) => ({ path: volume.path, volume: volume.number }));
      }
    }

    // A cover is for mangapress to make; a run that stops at the joined volumes has no use for one.
    if (usesMangapress(mode)) {
      inputs = withCovers(inputs, await this.covers.pathsFor(session.selection.inputPath));
    }

    const result = await this.books.produceVolumes(
      inputs,
      mode,
      {
        libraryPath: request.libraryPath,
        settings: request.settings,
        details,
        format: request.format,
        nestedToc: singleBook,
      },
      { onArtifact, onProgress, signal },
    );
    if (result.status === 'failed') throw result.error;
    const { artifacts } = result;
    onProgress({
      stage: 'saving',
      message: `${String(artifacts.length)} book${artifacts.length === 1 ? '' : 's'} saved.`,
      ...(mode === 'bind-only' || inputs.length === 1
        ? {}
        : {
            completed: inputs.length,
            total: inputs.length,
            volumes: inputs.map((_input, index) => ({
              number: index + 1,
              status: 'done' as const,
            })),
          }),
    });
    // A finished session is spent: this frees the scratch copies of the joined volumes now instead
    // of when the user starts over. A failed or cancelled run keeps it, so a retry needs no re-scan.
    await this.sessions.release(request.sessionId);
    return artifacts;
  }

  async plan(
    request: ConversionRequest,
    { signal }: { readonly signal?: AbortSignal } = {},
  ): Promise<WorkflowPlan> {
    const { session, mode, singleBook } = this.assertRunnable(request, 'validating the plan');

    if (session.selection.kind === 'cbz' || mode === 'convert-only') {
      const plan = await this.conversion.plan(
        {
          inputPath: session.selection.inputPath,
          outputDirectory: request.libraryPath,
          settings: request.settings,
          book: detailsForBook(request.details ?? noBookDetails),
          format: request.format,
          nestedToc: false,
        },
        signal === undefined ? {} : { signal },
      );
      return {
        tool: 'mangapress',
        title: plan.title,
        message: `mangapress validated ${plan.profile} · ${String(plan.width)} × ${String(plan.height)}${session.selection.kind === 'folder' ? ' · one book, chapters not grouped' : ''} · no library files written`,
        books: [{ name: plan.name, pageCount: plan.pageCount }],
        issues: [],
      };
    }
    if (
      session.trustedDraft === undefined ||
      session.workspaceId === undefined ||
      request.mapping === undefined
    ) {
      throw new ConversionWorkflowError(
        'mapping_required',
        'Confirm the chapter-to-volume mapping before validating the plan.',
      );
    }
    const mapping = trustedMapping(session.trustedDraft, request.mapping);
    const plan = await this.binding.plan(session.workspaceId, mapping, signal);
    return {
      tool: 'mangabind',
      title: plan.title,
      message: `mangabind validated ${String(plan.volumes.length)} volume${plan.volumes.length === 1 ? '' : 's'}${singleBook ? ' · single book for the series' : mode === 'bind-only' ? ' · saved as CBZ files, mangapress not run' : ''} · no library files written`,
      books: singleBook ? [plannedSingleBook(plan.title, plan.volumes)] : plan.volumes,
      issues: plan.issues,
    };
  }

  /** The single-input checks stay in the same order for conversion and plan validation. */
  private assertRunnable(
    request: ConversionRequest,
    action: RunAction,
  ): { readonly session: ActiveSession; readonly mode: ProcessMode; readonly singleBook: boolean } {
    const mode = validateRunOptions(request, action);
    const session = this.sessions.requireSession(request.sessionId);
    rejectLibrary(session);
    const unsupported = unsupportedModeReason(session.selection.kind, mode);
    if (unsupported !== undefined)
      throw new ConversionWorkflowError('unsupported_mode', unsupported);
    const singleBook = session.selection.kind !== 'cbz' && Boolean(request.singleBook);
    if (singleBook) assertSingleBook(mode, request.format);
    return { session, mode, singleBook };
  }
}

/** A library is converted through its own run, so the calls for one input refuse its session. */
function rejectLibrary(session: ActiveSession): void {
  if (session.library !== undefined) {
    throw new ConversionWorkflowError(
      'unsupported_mode',
      'A library is converted title by title, not as one input.',
    );
  }
}
