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
      onProgress,
      signal,
    }: {
      readonly onProgress: (progress: ConversionProgress) => void;
      readonly signal?: AbortSignal;
    },
  ): Promise<readonly ConversionArtifact[]> {
    if (validateMangapressSettings(request.settings).length > 0) {
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

    let inputs: readonly string[];
    if (session.selection.kind === 'cbz') {
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
      const volume = `${String(index + 1)} of ${String(inputs.length)}`;
      onProgress({
        stage: 'processing',
        volume,
        message: `Converting volume ${volume}…`,
      });
      artifacts.push(
        await this.conversion.convert(
          {
            inputPath,
            outputDirectory: request.libraryPath,
            settings: request.settings,
            format: request.format,
          },
          {
            ...(signal === undefined ? {} : { signal }),
            onProgress: (progress) => {
              onProgress({ ...progress, volume });
            },
          },
        ),
      );
    }
    onProgress({
      stage: 'saving',
      message: `${String(artifacts.length)} book${artifacts.length === 1 ? '' : 's'} saved.`,
    });
    return artifacts;
  }

  async plan(
    request: ConversionRequest,
    { signal }: { readonly signal?: AbortSignal } = {},
  ): Promise<WorkflowPlan> {
    if (validateMangapressSettings(request.settings).length > 0) {
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
    if (session.selection.kind === 'cbz') {
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
        message: `mangapress validated ${plan.profile} · ${String(plan.width)} × ${String(plan.height)} · no library files written`,
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
      message: `mangabind validated ${String(plan.volumes.length)} volume${plan.volumes.length === 1 ? '' : 's'} · no library files written`,
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
    },
    {
      onProgress,
      signal,
    }: {
      readonly onProgress: (progress: ConversionProgress) => void;
      readonly signal?: AbortSignal;
    },
  ): Promise<readonly BatchTitleOutcome[]> {
    if (validateMangapressSettings(request.settings).length > 0) {
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
            const volume = `${String(index + 1)} of ${String(title.volumePaths.length)}`;
            onProgress({
              stage: 'processing',
              title: title.title,
              volume,
              message: `Converting ${title.title} · volume ${volume}…`,
            });
            artifacts.push(
              await this.conversion.convert(
                {
                  inputPath: volumePath,
                  outputDirectory: request.libraryPath,
                  settings: request.settings,
                  format: request.format,
                },
                {
                  ...(signal === undefined ? {} : { signal }),
                  onProgress: (progress) => {
                    onProgress({ ...progress, title: title.title, volume });
                  },
                },
              ),
            );
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
