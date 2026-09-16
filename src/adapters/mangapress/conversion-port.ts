import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { MangapressCliAdapter } from './cli';
import { isMangapressPageEvent, type MangapressErrorEvent, type MangapressEvent } from './protocol';

import type { ConversionPort } from '@/application/ports/conversion-tools';
import {
  type BookFormat,
  type ConversionArtifact,
  type ConversionProgress,
  type PipelineIssue,
  ToolExecutionError,
} from '@/domain/conversion';
import type { MangapressSettings } from '@/domain/output-profile';

export class MangapressConversionAdapter implements ConversionPort {
  constructor(
    private readonly cli: Pick<MangapressCliAdapter, 'run'>,
    private readonly createId: () => string = randomUUID,
  ) {}

  async plan(
    request: {
      readonly inputPath: string;
      readonly outputDirectory: string;
      readonly settings: MangapressSettings;
      readonly format: BookFormat;
    },
    options: { readonly signal?: AbortSignal } = {},
  ): ReturnType<ConversionPort['plan']> {
    const { deviceProfile, ...settings } = request.settings;
    const run = await this.cli.run(
      {
        inputPath: request.inputPath,
        outputPath: request.outputDirectory,
        profile: deviceProfile,
        format: request.format,
        dryRun: true,
        ...settings,
      },
      options.signal === undefined ? {} : { signal: options.signal },
    );
    const result = requireSuccessfulResult(run);
    if (
      result.operation !== 'convert' ||
      result.dry_run !== true ||
      result.written !== false ||
      result.output_path === undefined ||
      result.manga === undefined ||
      result.profile === undefined ||
      result.width === undefined ||
      result.height === undefined ||
      result.source_pages === undefined
    ) {
      throw new Error('Mangapress returned an incomplete conversion plan.');
    }
    const outputPath = checkedChildPath(request.outputDirectory, result.output_path);
    return {
      title: result.manga,
      name: path.basename(outputPath),
      pageCount: result.source_pages,
      profile: result.profile,
      width: result.width,
      height: result.height,
    };
  }

  async convert(
    request: {
      readonly inputPath: string;
      readonly outputDirectory: string;
      readonly settings: MangapressSettings;
      readonly format: BookFormat;
    },
    options: {
      readonly signal?: AbortSignal;
      readonly onProgress: (progress: ConversionProgress) => void;
    },
  ): Promise<ConversionArtifact> {
    const { deviceProfile, ...settings } = request.settings;
    const run = await this.cli.run(
      {
        inputPath: request.inputPath,
        outputPath: request.outputDirectory,
        profile: deviceProfile,
        format: request.format,
        dryRun: false,
        ...settings,
      },
      {
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        onEvent: (event) => {
          const progress = progressFromEvent(event);
          if (progress !== undefined) options.onProgress(progress);
        },
      },
    );
    const result = requireSuccessfulResult(run);
    if (
      result.operation !== 'convert' ||
      result.written !== true ||
      result.output_path === undefined ||
      result.bytes === undefined ||
      result.format === undefined
    ) {
      throw new Error('Mangapress returned an incomplete conversion result.');
    }
    const outputPath = checkedChildPath(request.outputDirectory, result.output_path);
    return {
      id: this.createId(),
      name: path.basename(outputPath),
      path: outputPath,
      bytes: result.bytes,
      format: result.format,
      title: result.manga ?? path.basename(outputPath, path.extname(outputPath)),
      author: result.author ?? 'Unknown',
    };
  }
}

function requireSuccessfulResult(
  run: Awaited<ReturnType<MangapressCliAdapter['run']>>,
): NonNullable<Awaited<ReturnType<MangapressCliAdapter['run']>>['result']> {
  if (run.exitCode === 0 && run.result !== undefined) return run.result;
  const error = run.errors[0];
  const issue =
    error === undefined
      ? {
          tool: 'mangapress' as const,
          severity: 'error' as const,
          code: 'process_failed',
          stage: 'conversion',
          recoverable: true,
          message: 'Mangapress could not convert this volume.',
          ...(run.stderr === '' ? {} : { diagnostic: run.stderr }),
        }
      : issueFromError(error);
  throw new ToolExecutionError(issue, run.exitCode);
}

function issueFromError(error: MangapressErrorEvent): PipelineIssue {
  return {
    tool: 'mangapress',
    severity: 'error',
    code: error.code,
    stage: error.stage,
    recoverable: error.recoverable,
    message: error.message,
    diagnostic: error.diagnostic,
    ...(error.manga === undefined ? {} : { manga: error.manga }),
    ...(error.volume === undefined ? {} : { volume: String(error.volume) }),
    ...(error.chapter === undefined ? {} : { chapter: String(error.chapter) }),
    ...(error.page === undefined ? {} : { page: error.page }),
    ...(error.path === undefined ? {} : { path: error.path }),
  };
}

function progressFromEvent(event: MangapressEvent): ConversionProgress | undefined {
  if (isMangapressPageEvent(event)) {
    return {
      stage: 'processing',
      message: `Processed page ${String(event.completed)} of ${String(event.total)}.`,
      completed: event.completed,
      total: event.total,
      chapter: event.chapter,
      page: event.page,
    };
  }
  if (event.type === 'stage' && event.state === 'started' && typeof event.stage === 'string') {
    return {
      stage: event.stage === 'write' ? 'saving' : 'processing',
      message: event.stage === 'write' ? 'Saving the finished book…' : `Starting ${event.stage}…`,
    };
  }
  return undefined;
}

function checkedChildPath(parentPath: string, childPath: string): string {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  const parentUrl = pathToFileURL(`${parent}${path.sep}`).href;
  if (!pathToFileURL(child).href.startsWith(parentUrl)) {
    throw new Error('Mangapress reported an output outside the selected library.');
  }
  return child;
}
