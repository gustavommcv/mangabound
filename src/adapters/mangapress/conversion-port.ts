import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import sanitizeFilename from 'sanitize-filename';

import type { MangapressCliAdapter } from './cli';
import { isMangapressPageEvent, type MangapressErrorEvent, type MangapressEvent } from './protocol';

import type { ConversionPort } from '@/application/ports/conversion-tools';
import { type BookDetails, canonicalLanguageTag } from '@/domain/book-details';
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
      readonly book?: BookDetails;
      readonly format: BookFormat;
      readonly nestedToc?: boolean;
    },
    options: { readonly signal?: AbortSignal } = {},
  ): ReturnType<ConversionPort['plan']> {
    const { combineIntoOneVolume, deviceProfile, ...settings } = request.settings;
    void combineIntoOneVolume;
    const nestedToc = Boolean(request.nestedToc);
    const run = await this.cli.run(
      {
        inputPath: request.inputPath,
        outputPath: conversionOutputPath(request),
        profile: deviceProfile,
        format: request.format,
        dryRun: true,
        nestedToc,
        ...settings,
        ...bookArguments(request.book, settings.language),
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
      readonly book?: BookDetails;
      readonly cover?: string;
      readonly format: BookFormat;
      readonly nestedToc?: boolean;
    },
    options: {
      readonly signal?: AbortSignal;
      readonly onProgress: (progress: ConversionProgress) => void;
    },
  ): Promise<ConversionArtifact> {
    const { combineIntoOneVolume, deviceProfile, ...settings } = request.settings;
    void combineIntoOneVolume;
    const nestedToc = Boolean(request.nestedToc);
    const run = await this.cli.run(
      {
        inputPath: request.inputPath,
        outputPath: conversionOutputPath(request),
        profile: deviceProfile,
        format: request.format,
        dryRun: false,
        nestedToc,
        ...settings,
        ...bookArguments(request.book, settings.language),
        ...(request.cover === undefined ? {} : { cover: request.cover }),
      },
      {
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        onEvent: (event) => {
          const progress = progressFromEvent(event);
          if (progress !== undefined) options.onProgress(progress);
        },
      },
    );
    const result = requireSuccessfulResult(
      run,
      request.cover === undefined
        ? undefined
        : { book: request.book?.title ?? path.basename(request.inputPath) },
    );
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
      // Only the code and the tool's own sentence go on: the path in a warning is the tool's
      // input, which for a bound volume is a scratch file nobody chose.
      ...(run.warnings.length === 0
        ? {}
        : { warnings: run.warnings.map(({ code, message }) => ({ code, message })) }),
    };
  }
}

/** The codes with which mangapress says the cover it was given could not be used. */
const coverErrorCodes: ReadonlySet<string> = new Set(['cover_build_failed', 'cover_read_failed']);

function requireSuccessfulResult(
  run: Awaited<ReturnType<MangapressCliAdapter['run']>>,
  cover?: { readonly book: string },
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
  throw new ToolExecutionError(
    cover !== undefined && coverErrorCodes.has(issue.code)
      ? aboutTheCover(issue, cover.book)
      : issue,
    run.exitCode,
  );
}

/**
 * The cover a person chose for a book could not be used. The tool says so in terms of an image;
 * the person needs to know which book it is and where to change it, and the tool's own words and
 * diagnostic stay with the details.
 */
function aboutTheCover(issue: PipelineIssue, book: string): PipelineIssue {
  return {
    ...issue,
    message: `The cover chosen for ${book} could not be used. Remove it, or choose another image, on the book’s details page.`,
    diagnostic: [issue.message, issue.diagnostic].filter((part) => part !== undefined).join(' '),
  };
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

/**
 * Since mangapress 0.7.3, --title changes metadata only. Use its existing explicit-file output
 * for a typed title, leaving validation, collision handling and publication to the tool.
 */
function conversionOutputPath(request: {
  readonly outputDirectory: string;
  readonly book?: BookDetails;
  readonly format: BookFormat;
  readonly settings: MangapressSettings;
}): string {
  if (request.book?.title === undefined) return request.outputDirectory;
  // Reuse portable filename sanitization; the metadata still receives the original title.
  const stem = sanitizeFilename(request.book.title, { replacement: '-' }) || 'Book';
  // This is the pinned tool's profile-code convention and --nokepub/custom-size rule, not a
  // separate list of devices. Explicit output files retain the extension we ask for.
  const kepub =
    request.format === 'epub' &&
    request.settings.deviceProfile.startsWith('Ko') &&
    !request.settings.noKepub &&
    (request.settings.customWidth ?? 0) === 0 &&
    (request.settings.customHeight ?? 0) === 0;
  return path.join(request.outputDirectory, `${stem}.${kepub ? 'kepub.epub' : request.format}`);
}

/** The title, author and language one book is made with: its own details over the defaults. */
function bookArguments(
  book: BookDetails | undefined,
  defaultLanguage: string,
): { readonly title?: string; readonly author?: string; readonly language: string } {
  return {
    ...(book?.title === undefined ? {} : { title: book.title }),
    ...(book?.author === undefined ? {} : { author: book.author }),
    // However it was typed or kept, the book is written with the casing BCP 47 recommends.
    language: canonicalLanguageTag(book?.language ?? defaultLanguage),
  };
}
