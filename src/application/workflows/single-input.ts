import type { BookFileStorePort, SavedBookFile } from '@/application/ports/book-file-store';
import type {
  BindingBatchPlan,
  BindingPort,
  ConversionPort,
} from '@/application/ports/conversion-tools';
import {
  type BatchTitleOutcome,
  type BookFormat,
  type ConversionArtifact,
  type ConversionProgress,
  type ConversionRequest,
  ConversionWorkflowError,
  type InputSelection,
  type InspectedInput,
  type WorkflowPlan,
} from '@/domain/conversion';
import { createMappingDraft, type MappingDraft, validateMapping } from '@/domain/mapping';
import { type MangapressSettings, validateMangapressSettings } from '@/domain/output-profile';
import {
  type BatchProcessMode,
  defaultProcessMode,
  type ProcessMode,
  unsupportedModeReason,
  usesMangapress,
} from '@/domain/process-mode';

interface ActiveSession {
  readonly selection: InputSelection;
  readonly trustedDraft?: MappingDraft;
  readonly workspaceId?: string;
}

export class SingleInputWorkflow {
  private readonly sessions = new Map<string, ActiveSession>();

  constructor(
    private readonly binding: BindingPort,
    private readonly conversion: ConversionPort,
    private readonly createId: () => string,
    private readonly bookFiles: BookFileStorePort,
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
    if (usesMangapress(mode) && validateMangapressSettings(request.settings).length > 0) {
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
    const unsupported = unsupportedModeReason(session.selection.kind, mode);
    if (unsupported !== undefined)
      throw new ConversionWorkflowError('unsupported_mode', unsupported);

    let inputs: readonly string[];
    if (session.selection.kind === 'cbz' || mode === 'convert-only') {
      // Already one book (or explicitly not grouped): straight to mangapress, no mapping needed.
      inputs = [session.selection.inputPath];
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
      onProgress({ stage: 'binding', message: 'Building volume files…' });
      const bound = await this.binding.bind(session.workspaceId, mapping, signal);
      if (bound.volumePaths.length === 0) {
        throw new ConversionWorkflowError(
          'no_volumes',
          'No volume files were produced. Review the chapter mapping and try again.',
        );
      }
      inputs = bound.volumePaths;
    }

    const artifacts: ConversionArtifact[] = [];
    for (const [index, inputPath] of inputs.entries()) {
      const artifact = await this.produceBook(
        mode,
        {
          inputPath,
          libraryPath: request.libraryPath,
          settings: request.settings,
          format: request.format,
        },
        { volume: `${String(index + 1)} of ${String(inputs.length)}`, onProgress, signal },
      );
      artifacts.push(artifact);
      onArtifact?.(artifact);
    }
    onProgress({
      stage: 'saving',
      message: `${String(artifacts.length)} book${artifacts.length === 1 ? '' : 's'} saved.`,
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
    if (usesMangapress(mode) && validateMangapressSettings(request.settings).length > 0) {
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
    const unsupported = unsupportedModeReason(session.selection.kind, mode);
    if (unsupported !== undefined)
      throw new ConversionWorkflowError('unsupported_mode', unsupported);
    if (session.selection.kind === 'cbz' || mode === 'convert-only') {
      const plan = await this.conversion.plan(
        {
          inputPath: session.selection.inputPath,
          outputDirectory: request.libraryPath,
          settings: request.settings,
          format: request.format,
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
      message: `mangabind validated ${String(plan.volumes.length)} volume${plan.volumes.length === 1 ? '' : 's'}${mode === 'bind-only' ? ' · saved as CBZ files, mangapress not run' : ''} · no library files written`,
      books: plan.volumes,
      issues: plan.issues,
    };
  }

  async planBatch(parentPath: string, signal?: AbortSignal): Promise<BindingBatchPlan> {
    if (this.binding.planBatch === undefined) {
      throw new Error('This binding port does not support batch planning.');
    }
    return this.binding.planBatch(parentPath, signal);
  }

  async writeTitleMapping(inputPath: string, mapping: MappingDraft): Promise<void> {
    if (this.binding.writeTitleMapping === undefined) {
      throw new Error('This binding port does not support writing title mappings.');
    }
    await this.binding.writeTitleMapping(inputPath, mapping);
  }

  async convertBatch(
    request: {
      readonly parentPath: string;
      readonly libraryPath: string;
      readonly settings: MangapressSettings;
      readonly format: BookFormat;
      readonly titles?: readonly string[];
      readonly mode?: BatchProcessMode;
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
    if (usesMangapress(mode) && validateMangapressSettings(request.settings).length > 0) {
      throw new ConversionWorkflowError(
        'invalid_settings',
        'Review the output settings before converting.',
      );
    }
    if (this.binding.bindBatch === undefined) {
      throw new Error('This binding port does not support batch binding.');
    }
    const bound = await this.binding.bindBatch(request.parentPath, signal);
    const titles =
      request.titles === undefined
        ? bound.titles
        : bound.titles.filter((title) => request.titles?.includes(title.title) === true);

    const outcomes: BatchTitleOutcome[] = [];
    try {
      for (const title of titles) {
        if (signal?.aborted === true) break;
        if (title.status === 'failed' || title.volumePaths.length === 0) {
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
          for (const [index, volumePath] of title.volumePaths.entries()) {
            const artifact = await this.produceBook(
              mode,
              {
                inputPath: volumePath,
                libraryPath: request.libraryPath,
                settings: request.settings,
                format: request.format,
              },
              {
                title: title.title,
                volume: `${String(index + 1)} of ${String(title.volumePaths.length)}`,
                onProgress,
                signal,
              },
            );
            artifacts.push(artifact);
            onArtifact?.(artifact);
          }
          outcomes.push({ title: title.title, status: 'done', artifacts });
        } catch (error) {
          outcomes.push({ title: title.title, status: 'failed', artifacts, error });
        }
      }
    } finally {
      await this.binding.release(bound.workspaceId);
    }
    return outcomes;
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
      readonly format: BookFormat;
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
    return this.conversion.convert(
      {
        inputPath: request.inputPath,
        outputDirectory: request.libraryPath,
        settings: request.settings,
        format: request.format,
      },
      {
        ...(context.signal === undefined ? {} : { signal: context.signal }),
        onProgress: (progress) => {
          context.onProgress({ ...progress, ...tag });
        },
      },
    );
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
      if (signal?.aborted === true) throw error;
      throw new ConversionWorkflowError(
        'publish_failed',
        "Couldn't save a joined volume to the output folder. Check that the folder is writable and has free space.",
        { cause: error },
      );
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

  async release(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    if (session?.workspaceId !== undefined) await this.binding.release(session.workspaceId);
  }

  async releaseAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((sessionId) => this.release(sessionId)));
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
