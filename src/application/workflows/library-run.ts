import type { BindingPort } from '@/application/ports/conversion-tools';
import type { BookProduction } from '@/application/workflows/book-production';
import type { InputSessions } from '@/application/workflows/input-sessions';
import { presentBindingProgress } from '@/application/workflows/binding-progress';
import {
  assertSingleBook,
  emptyBindingError,
  validateRunOptions,
} from '@/application/workflows/run-preconditions';
import { type BookDetails, detailsForBook, noBookDetails } from '@/domain/book-details';
import type {
  BatchTitleOutcome,
  BookFormat,
  ConversionArtifact,
  ConversionProgress,
} from '@/domain/conversion';
import type { MangapressSettings } from '@/domain/output-profile';
import { type BatchProcessMode, usesMangapress } from '@/domain/process-mode';

/** Bind once, convert titles sequentially, retain partial outcomes and release the batch scratch. */
export class LibraryRun {
  constructor(
    private readonly binding: BindingPort,
    private readonly sessions: InputSessions,
    private readonly books: BookProduction,
  ) {}

  /** Joins a library with one mangabind call, then makes a book of each volume of each title. */
  async convert(
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
    const mode = validateRunOptions(request, 'converting');
    const singleBook = Boolean(request.singleBook);
    if (singleBook) assertSingleBook(mode, request.format);
    const { session } = this.sessions.librarySession(request.sessionId);
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
              error: emptyBindingError('binding_failed'),
            });
            continue;
          }
          const artifacts: ConversionArtifact[] = [];
          try {
            const artifact = await this.books.produceBook(
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
              error: emptyBindingError('binding_failed'),
            });
            continue;
          }
          const result = await this.books.produceVolumes(
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
          );
          outcomes.push({ title: title.title, ...result });
        }
      }
    } finally {
      await this.binding.release(bound.workspaceId);
    }
    return outcomes;
  }
}
