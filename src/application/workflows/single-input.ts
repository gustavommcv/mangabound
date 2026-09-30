import type { BookFileStorePort, SavedBookFile } from '@/application/ports/book-file-store';
import { presentBindingProgress } from '@/application/workflows/binding-progress';
import type {
  BindingBatchPlan,
  BindingBatchTitle,
  BindingPort,
  ConversionPort,
} from '@/application/ports/conversion-tools';
import { type BookDetails, detailsForBook, noBookDetails } from '@/domain/book-details';
import {
  type BatchTitleOutcome,
  type BookFormat,
  type ConversionArtifact,
  type ConversionProgress,
  type ConversionRequest,
  ConversionWorkflowError,
  type InputSelection,
  type InspectedInput,
  type InspectedTitle,
  type LibraryPlan,
  plannedSingleBook,
  type VolumeConversionProgress,
  type WorkflowPlan,
} from '@/domain/conversion';
import { createMappingDraft, type MappingDraft, validateMapping } from '@/domain/mapping';
import {
  FORMATS_SUPPORTING_COMBINED_VOLUME,
  type MangapressSettings,
  validateMangapressSettings,
} from '@/domain/output-profile';
import {
  type BatchProcessMode,
  defaultProcessMode,
  type ProcessMode,
  unsupportedModeReason,
  usesMangapress,
} from '@/domain/process-mode';

/** A file to make a book of: one volume of a series, or a book that is not a volume. */
interface BookInput {
  readonly path: string;
  /** The volume's number in its series; absent for a book that is not one volume of it. */
  readonly volume?: number;
}

/** The manga folders of a library as last planned. Their paths never leave the workflow. */
interface LibraryState {
  readonly titles: readonly BindingBatchTitle[];
}

interface ActiveSession {
  readonly selection: InputSelection;
  readonly trustedDraft?: MappingDraft;
  readonly workspaceId?: string;
  /** Set when the folder turned out to be a library rather than one manga. */
  readonly library?: LibraryState;
}

export class SingleInputWorkflow {
  private readonly sessions = new Map<string, ActiveSession>();

  constructor(
    private readonly binding: BindingPort,
    private readonly conversion: ConversionPort,
    private readonly createId: () => string,
    private readonly bookFiles: BookFileStorePort,
    private readonly maxParallelConversions = 1,
  ) {}

  async inspect(selection: InputSelection, signal?: AbortSignal): Promise<InspectedInput> {
    const sessionId = this.createId();
    if (selection.kind === 'cbz') {
      this.sessions.set(sessionId, { selection });
      return {
        sessionId,
        displayName: selection.displayName,
        kind: 'cbz',
        issues: [],
      };
    }

    const inspection = await this.binding.inspect(selection.inputPath, signal);
    const library = await this.probeLibrary(selection.inputPath, inspection.draft, signal);
    if (library !== undefined) {
      // Reading the folder as one manga left a scratch copy behind that a library has no use for.
      await this.binding.release(inspection.workspaceId);
      this.sessions.set(sessionId, { selection, library: { titles: library.titles } });
      return {
        sessionId,
        displayName: selection.displayName,
        kind: 'library',
        titles: library.titles.map(summarizeTitle),
        issues: library.issues,
      };
    }
    this.sessions.set(sessionId, {
      selection,
      trustedDraft: inspection.draft,
      workspaceId: inspection.workspaceId,
    });
    return {
      sessionId,
      displayName: selection.displayName,
      kind: 'folder',
      mapping: inspection.draft,
      issues: inspection.issues,
    };
  }

  /**
   * Tells a library from a manga folder. A manga folder holds chapters with pages in them. A
   * library holds manga folders, which mangabind reads as chapters that have no pages of their own
   * (a title named like "Mob Psycho 100" even parses as one), so a folder with no chapter that has
   * pages is read once more as a library. It is one only if that finds manga with chapters in them.
   */
  private async probeLibrary(
    inputPath: string,
    draft: MappingDraft,
    signal: AbortSignal | undefined,
  ): Promise<
    | { readonly titles: readonly BindingBatchTitle[]; readonly issues: LibraryPlan['issues'] }
    | undefined
  > {
    if (draft.chapters.some((chapter) => chapter.pageCount > 0)) return undefined;
    let plan: BindingBatchPlan;
    try {
      plan = await this.binding.planBatch(inputPath, signal);
    } catch (error) {
      if (signal?.aborted === true) throw error;
      // Not readable as a library either: it stays a folder, which says it has nothing in it.
      return undefined;
    }
    const titles = plan.titles.filter((title) => title.draft.chapters.length > 0);
    return titles.length === 0 ? undefined : { titles, issues: plan.issues };
  }

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
    const mode = request.mode ?? defaultProcessMode;
    const requestedSingleBook = Boolean(request.singleBook);
    if (
      usesMangapress(mode) &&
      validateMangapressSettings(request.settings, request.format).length > 0
    ) {
      throw new ConversionWorkflowError(
        'invalid_settings',
        'Review the output settings before converting.',
      );
    }
    const session = this.sessions.get(request.sessionId);
    if (session === undefined) {
      throw new ConversionWorkflowError(
        'session_not_found',
        'This input is no longer available. Choose it again.',
      );
    }
    rejectLibrary(session);
    const unsupported = unsupportedModeReason(session.selection.kind, mode);
    if (unsupported !== undefined)
      throw new ConversionWorkflowError('unsupported_mode', unsupported);

    const isCbz = session.selection.kind === 'cbz';
    const singleBook = isCbz ? false : requestedSingleBook;
    if (requestedSingleBook && !isCbz) {
      if (mode !== 'bind-and-convert') {
        throw new ConversionWorkflowError(
          'invalid_settings',
          'Single book mode requires both binding and converting.',
        );
      }
      if (!FORMATS_SUPPORTING_COMBINED_VOLUME.has(request.format)) {
        throw new ConversionWorkflowError(
          'invalid_settings',
          'Binding the whole series as one volume is only available for EPUB right now.',
        );
      }
    }

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
          throw new ConversionWorkflowError(
            'no_volumes',
            'No volume files were produced. Review the chapter mapping and try again.',
          );
        }
        inputs = [{ path: bound.combinedOutputPath }];
      } else {
        if (bound.volumes.length === 0) {
          throw new ConversionWorkflowError(
            'no_volumes',
            'No volume files were produced. Review the chapter mapping and try again.',
          );
        }
        inputs = bound.volumes.map((volume) => ({ path: volume.path, volume: volume.number }));
      }
    }

    const artifacts: ConversionArtifact[] = [];
    await this.produceVolumes(
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
      artifacts,
    );
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
    await this.release(request.sessionId);
    return artifacts;
  }

  async plan(
    request: ConversionRequest,
    { signal }: { readonly signal?: AbortSignal } = {},
  ): Promise<WorkflowPlan> {
    const mode = request.mode ?? defaultProcessMode;
    const requestedSingleBook = Boolean(request.singleBook);
    if (
      usesMangapress(mode) &&
      validateMangapressSettings(request.settings, request.format).length > 0
    ) {
      throw new ConversionWorkflowError(
        'invalid_settings',
        'Review the output settings before validating the plan.',
      );
    }
    const session = this.sessions.get(request.sessionId);
    if (session === undefined) {
      throw new ConversionWorkflowError(
        'session_not_found',
        'This input is no longer available. Choose it again.',
      );
    }
    rejectLibrary(session);
    const unsupported = unsupportedModeReason(session.selection.kind, mode);
    if (unsupported !== undefined)
      throw new ConversionWorkflowError('unsupported_mode', unsupported);

    const isCbz = session.selection.kind === 'cbz';
    const singleBook = isCbz ? false : requestedSingleBook;
    if (requestedSingleBook && !isCbz) {
      if (mode !== 'bind-and-convert') {
        throw new ConversionWorkflowError(
          'invalid_settings',
          'Single book mode requires both binding and converting.',
        );
      }
      if (!FORMATS_SUPPORTING_COMBINED_VOLUME.has(request.format)) {
        throw new ConversionWorkflowError(
          'invalid_settings',
          'Binding the whole series as one volume is only available for EPUB right now.',
        );
      }
    }

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

  /** Reads the library again, for instance after a title's mapping was saved. */
  async planLibrary(sessionId: string, signal?: AbortSignal): Promise<LibraryPlan> {
    const { session, library } = this.librarySession(sessionId);
    const plan = await this.binding.planBatch(session.selection.inputPath, signal);
    const titles = plan.titles.filter((title) => title.draft.chapters.length > 0);
    this.sessions.set(sessionId, { ...session, library: { ...library, titles } });
    return { titles: titles.map(summarizeTitle), issues: plan.issues };
  }

  /**
   * Saves what the user confirmed for one title of a library as that title folder's mangabind.json.
   * The folder is looked up in what the workflow read, and the chapters come from there too: the
   * renderer only gets to say which volume each one belongs to.
   */
  async writeTitleMapping(sessionId: string, title: string, mapping: MappingDraft): Promise<void> {
    const { library } = this.librarySession(sessionId);
    const known = library.titles.find((candidate) => candidate.title === title);
    if (known === undefined) {
      throw new ConversionWorkflowError(
        'title_not_found',
        'That title is no longer in the library. Choose the library again.',
      );
    }
    await this.binding.writeTitleMapping(known.inputPath, trustedMapping(known.draft, mapping));
  }

  /** Joins a library with one mangabind call, then makes a book of each volume of each title. */
  async convertLibrary(
    request: {
      readonly sessionId: string;
      readonly libraryPath: string;
      readonly settings: MangapressSettings;
      readonly format: BookFormat;
      readonly titles?: readonly string[];
      readonly mode?: BatchProcessMode;
      readonly singleBook?: boolean;
      /** What was typed for each title of the library, by the title's name. */
      readonly titleDetails?: readonly { readonly title: string; readonly details: BookDetails }[];
    },
    {
      onArtifact,
      onProgress,
      signal,
    }: {
      readonly onArtifact?: (artifact: ConversionArtifact) => void;
      readonly onProgress: (progress: ConversionProgress) => void;
      readonly signal?: AbortSignal;
    },
  ): Promise<readonly BatchTitleOutcome[]> {
    const mode = request.mode ?? defaultProcessMode;
    const singleBook = Boolean(request.singleBook);
    if (
      usesMangapress(mode) &&
      validateMangapressSettings(request.settings, request.format).length > 0
    ) {
      throw new ConversionWorkflowError(
        'invalid_settings',
        'Review the output settings before converting.',
      );
    }
    if (singleBook) {
      if (mode !== 'bind-and-convert') {
        throw new ConversionWorkflowError(
          'invalid_settings',
          'Single book mode requires both binding and converting.',
        );
      }
      if (!FORMATS_SUPPORTING_COMBINED_VOLUME.has(request.format)) {
        throw new ConversionWorkflowError(
          'invalid_settings',
          'Binding the whole series as one volume is only available for EPUB right now.',
        );
      }
    }
    const { session } = this.librarySession(request.sessionId);
    onProgress({
      stage: 'binding',
      message: 'Building volume files for the library…',
    });
    const bound = await this.binding.bindBatch(
      session.selection.inputPath,
      signal,
      singleBook,
      (progress) => {
        onProgress(presentBindingProgress(progress));
      },
    );
    const titles =
      request.titles === undefined
        ? bound.titles
        : bound.titles.filter((title) => request.titles?.includes(title.title) === true);

    const detailsOf = (title: string): BookDetails =>
      usesMangapress(mode)
        ? (request.titleDetails?.find((entry) => entry.title === title)?.details ?? noBookDetails)
        : noBookDetails;

    const outcomes: BatchTitleOutcome[] = [];
    try {
      for (const title of titles) {
        if (signal?.aborted === true) break;
        if (singleBook) {
          if (title.status === 'failed' || title.combinedOutputPath === undefined) {
            outcomes.push({
              title: title.title,
              status: 'failed',
              artifacts: [],
              error: new ConversionWorkflowError(
                'binding_failed',
                'No volume files were produced. Review the chapter mapping and try again.',
              ),
            });
            continue;
          }
          const artifacts: ConversionArtifact[] = [];
          try {
            const artifact = await this.produceBook(
              mode,
              {
                inputPath: title.combinedOutputPath,
                libraryPath: request.libraryPath,
                settings: request.settings,
                book: detailsForBook(detailsOf(title.title)),
                format: request.format,
                nestedToc: true,
              },
              {
                title: title.title,
                volume: '1 of 1',
                onProgress,
                signal,
              },
            );
            artifacts.push(artifact);
            onArtifact?.(artifact);
            outcomes.push({ title: title.title, status: 'done', artifacts });
          } catch (error) {
            outcomes.push({ title: title.title, status: 'failed', artifacts, error });
          }
        } else {
          if (title.status === 'failed' || title.volumes.length === 0) {
            outcomes.push({
              title: title.title,
              status: 'failed',
              artifacts: [],
              error: new ConversionWorkflowError(
                'binding_failed',
                'No volume files were produced. Review the chapter mapping and try again.',
              ),
            });
            continue;
          }
          const artifacts: ConversionArtifact[] = [];
          try {
            await this.produceVolumes(
              title.volumes.map((volume) => ({ path: volume.path, volume: volume.number })),
              mode,
              {
                libraryPath: request.libraryPath,
                settings: request.settings,
                details: detailsOf(title.title),
                format: request.format,
                nestedToc: false,
              },
              { title: title.title, onArtifact, onProgress, signal },
              artifacts,
            );
            outcomes.push({ title: title.title, status: 'done', artifacts });
          } catch (error) {
            outcomes.push({ title: title.title, status: 'failed', artifacts, error });
          }
        }
      }
    } finally {
      await this.binding.release(bound.workspaceId);
    }
    return outcomes;
  }

  /** Converts a title's volumes with a small worker pool, but reports books in volume order. */
  private async produceVolumes(
    inputs: readonly BookInput[],
    mode: ProcessMode,
    request: {
      readonly libraryPath: string;
      readonly settings: MangapressSettings;
      /** What was typed for the series or book these files make. */
      readonly details: BookDetails;
      readonly format: BookFormat;
      readonly nestedToc: boolean;
    },
    context: {
      readonly title?: string;
      readonly onArtifact?: (artifact: ConversionArtifact) => void;
      readonly onProgress: (progress: ConversionProgress) => void;
      readonly signal?: AbortSignal;
    },
    artifacts: ConversionArtifact[],
  ): Promise<void> {
    const { details, ...bookRequest } = request;
    const convertAt = (
      index: number,
      signal: AbortSignal | undefined,
      onProgress: (progress: ConversionProgress) => void,
    ): Promise<ConversionArtifact> =>
      this.produceBook(
        mode,
        {
          inputPath: inputs[index]!.path,
          ...bookRequest,
          book: detailsForBook(details, inputs[index]!.volume),
        },
        {
          ...(context.title === undefined ? {} : { title: context.title }),
          volume: `${String(index + 1)} of ${String(inputs.length)}`,
          onProgress,
          signal,
        },
      );

    // Copying bound CBZs is cheap and must not compete for the destination. One book needs no pool.
    if (mode === 'bind-only' || inputs.length === 1) {
      for (const index of inputs.keys()) {
        context.signal?.throwIfAborted();
        const artifact = await convertAt(index, context.signal, context.onProgress);
        artifacts.push(artifact);
        context.onArtifact?.(artifact);
      }
      return;
    }

    context.signal?.throwIfAborted();
    const controller = new AbortController();
    const cancel = (): void => {
      controller.abort(context.signal?.reason);
    };
    context.signal?.addEventListener('abort', cancel, { once: true });
    const ordered: (ConversionArtifact | undefined)[] = Array.from({ length: inputs.length });
    const fractions = inputs.map(() => 0);
    const volumes: VolumeConversionProgress[] = inputs.map((_input, index) => ({
      number: index + 1,
      status: 'waiting',
    }));
    let next = 0;
    let nextToPublish = 0;
    let failure: { readonly error: unknown } | undefined;

    const publishReady = (): void => {
      while (ordered[nextToPublish] !== undefined) {
        const artifact = ordered[nextToPublish]!;
        nextToPublish += 1;
        artifacts.push(artifact);
        context.onArtifact?.(artifact);
      }
    };

    const progressFor = (index: number, progress?: ConversionProgress): void => {
      if (progress !== undefined) {
        const previous = volumes[index]!;
        volumes[index] = {
          ...previous,
          status: progress.stage === 'saving' ? 'saving' : 'processing',
          ...(progress.completed === undefined || progress.total === undefined
            ? {}
            : { completed: progress.completed, total: progress.total }),
        };
      }
      if (progress?.completed !== undefined && progress.total !== undefined && progress.total > 0) {
        fractions[index] = Math.max(
          fractions[index]!,
          Math.min(0.99, progress.completed / progress.total),
        );
      }
      const done = ordered.filter((artifact) => artifact !== undefined).length;
      context.onProgress({
        stage: 'processing',
        ...(context.title === undefined ? {} : { title: context.title }),
        volume: `${String(index + 1)} of ${String(inputs.length)}`,
        message: `${context.title === undefined ? '' : `${context.title} · `}${String(done)} of ${String(inputs.length)} volumes converted.`,
        completed: fractions.reduce((sum, fraction) => sum + fraction, 0),
        total: inputs.length,
        volumes: [...volumes],
      });
    };

    const worker = async (): Promise<void> => {
      while (!controller.signal.aborted && failure === undefined && next < inputs.length) {
        const index = next++;
        try {
          const artifact = await convertAt(index, controller.signal, (progress) => {
            progressFor(index, progress);
          });
          ordered[index] = artifact;
          fractions[index] = 1;
          const currentVolume = volumes[index]!;
          volumes[index] = {
            ...currentVolume,
            status: 'done',
            ...(currentVolume.total === undefined ? {} : { completed: currentVolume.total }),
          };
          progressFor(index);
          publishReady();
        } catch (error) {
          if (failure === undefined) {
            failure = { error };
          }
        }
      }
    };

    try {
      progressFor(0);
      await Promise.all(
        Array.from({ length: Math.min(this.maxParallelConversions, inputs.length) }, worker),
      );
    } finally {
      context.signal?.removeEventListener('abort', cancel);
    }
    // A failed volume can leave a gap in the ordered prefix. Keep later completed books too.
    for (const artifact of ordered.slice(nextToPublish)) {
      if (artifact !== undefined) {
        artifacts.push(artifact);
        context.onArtifact?.(artifact);
      }
    }
    if (failure !== undefined) throw failure.error;
    context.signal?.throwIfAborted();
  }

  /**
   * Turns one joined volume into a book: converted by mangapress, or, when the run stops after
   * joining, saved as the CBZ mangabind made.
   */
  private async produceBook(
    mode: ProcessMode,
    request: {
      readonly inputPath: string;
      readonly libraryPath: string;
      readonly settings: MangapressSettings;
      /** The title, author and language this book is made with. */
      readonly book: BookDetails;
      readonly format: BookFormat;
      readonly nestedToc?: boolean;
    },
    context: {
      readonly title?: string;
      readonly volume: string;
      readonly onProgress: (progress: ConversionProgress) => void;
      readonly signal?: AbortSignal | undefined;
    },
  ): Promise<ConversionArtifact> {
    const where =
      context.title === undefined
        ? `volume ${context.volume}`
        : `${context.title} · volume ${context.volume}`;
    const tag = {
      ...(context.title === undefined ? {} : { title: context.title }),
      volume: context.volume,
    };
    if (mode === 'bind-only') {
      context.onProgress({ stage: 'saving', ...tag, message: `Saving ${where}…` });
      return this.saveVolume(request.inputPath, request.libraryPath, context.signal);
    }
    context.onProgress({ stage: 'processing', ...tag, message: `Converting ${where}…` });
    // The tool writes into a folder of its own and the book is then given a name no other book of
    // the run has, so two books that would be called the same never overwrite each other.
    let converted = false;
    try {
      const { produced, saved } = await this.bookFiles.stageBook(
        { libraryPath: request.libraryPath },
        async (stagingPath) => {
          const artifact = await this.conversion.convert(
            {
              inputPath: request.inputPath,
              outputDirectory: stagingPath,
              settings: request.settings,
              book: request.book,
              format: request.format,
              nestedToc: request.nestedToc,
            },
            {
              ...(context.signal === undefined ? {} : { signal: context.signal }),
              onProgress: (progress) => {
                context.onProgress({ ...progress, ...tag });
              },
            },
          );
          converted = true;
          return artifact;
        },
        context.signal === undefined ? {} : { signal: context.signal },
      );
      return { ...produced, path: saved.path, name: saved.name, bytes: saved.bytes };
    } catch (error) {
      throw converted ? publishFailure(error, context.signal) : error;
    }
  }

  private async saveVolume(
    sourcePath: string,
    libraryPath: string,
    signal: AbortSignal | undefined,
  ): Promise<ConversionArtifact> {
    signal?.throwIfAborted();
    let saved: SavedBookFile;
    try {
      saved = await this.bookFiles.saveBook(
        { sourcePath, libraryPath },
        signal === undefined ? {} : { signal },
      );
    } catch (error) {
      throw publishFailure(error, signal);
    }
    return {
      id: this.createId(),
      name: saved.name,
      path: saved.path,
      bytes: saved.bytes,
      format: 'cbz',
      title: saved.name.replace(/\.cbz$/iu, ''),
      author: 'Unknown',
    };
  }

  private librarySession(sessionId: string): {
    readonly session: ActiveSession;
    readonly library: LibraryState;
  } {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      throw new ConversionWorkflowError(
        'session_not_found',
        'This input is no longer available. Choose it again.',
      );
    }
    if (session.library === undefined) {
      throw new ConversionWorkflowError('not_a_library', 'This input is not a library.');
    }
    return { session, library: session.library };
  }

  async release(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    if (session?.workspaceId !== undefined) await this.binding.release(session.workspaceId);
  }

  async releaseAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((sessionId) => this.release(sessionId)));
  }
}

/** A finished book that could not be put in pending storage; a cancellation stays a cancellation. */
function publishFailure(error: unknown, signal: AbortSignal | undefined): unknown {
  if (signal?.aborted === true) return error;
  return new ConversionWorkflowError(
    'publish_failed',
    "Couldn't write a finished book to Mangabound's pending storage. Check available space and storage permissions.",
    { cause: error },
  );
}

/** What the renderer is told about a title: everything but where it lives. */
function summarizeTitle(title: BindingBatchTitle): InspectedTitle {
  return {
    title: title.title,
    draft: title.draft,
    volumes: title.volumes,
    issues: title.issues,
  };
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

function trustedMapping(trusted: MappingDraft, submitted: MappingDraft): MappingDraft {
  let mapping: MappingDraft;
  try {
    mapping = createMappingDraft({
      mangaTitle: submitted.mangaTitle,
      chapters: trusted.chapters,
      volumes: submitted.volumes,
      ...(submitted.source === undefined ? {} : { source: submitted.source }),
    });
  } catch (error) {
    throw new ConversionWorkflowError(
      'invalid_mapping',
      'The chapter mapping contains unknown or invalid assignments.',
      { cause: error },
    );
  }
  const errors = validateMapping(mapping).filter((issue) => issue.severity === 'error');
  if (errors.length > 0) {
    throw new ConversionWorkflowError(
      'invalid_mapping',
      'Fix the chapter mapping errors before converting.',
      { cause: errors },
    );
  }
  return mapping;
}
