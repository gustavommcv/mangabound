import type { BookFileStorePort, SavedBookFile } from '@/application/ports/book-file-store';
import type { ConversionPort } from '@/application/ports/conversion-tools';
import {
  produceVolumes,
  type VolumeProductionContext,
  type VolumeProductionResult,
} from '@/application/workflows/volume-production';
import { type BookDetails, detailsForBook } from '@/domain/book-details';
import {
  type BookFormat,
  type ConversionArtifact,
  type ConversionProgress,
  ConversionWorkflowError,
} from '@/domain/conversion';
import type { MangapressSettings } from '@/domain/output-profile';
import type { ProcessMode } from '@/domain/process-mode';

/** A file to make a book of: one volume of a series, or a book that is not a volume. */
export interface BookInput {
  readonly path: string;
  /** The volume's number in its series; absent for a book that is not one volume of it. */
  readonly volume?: number;
}

/** The shared book-producing step: convert or copy, then publish a complete, uniquely named file. */
export class BookProduction {
  constructor(
    private readonly conversion: ConversionPort,
    private readonly createId: () => string,
    private readonly bookFiles: BookFileStorePort,
    private readonly maxParallelConversions: number,
  ) {}

  /** Give the scheduler one book-producing callback; metadata and paths stay in the workflow. */
  produceVolumes(
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
    context: VolumeProductionContext,
  ): Promise<VolumeProductionResult> {
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

    return produceVolumes(inputs.length, convertAt, {
      ...context,
      maxParallelConversions: this.maxParallelConversions,
      sequential: mode === 'bind-only',
    });
  }

  /**
   * Turns one joined volume into a book: converted by mangapress, or, when the run stops after
   * joining, saved as the CBZ mangabind made.
   */
  async produceBook(
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
    // Set from inside the callback below, so it is read as a property, not as a variable that the
    // compiler would take for still being false.
    const stage = { converted: false };
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
          stage.converted = true;
          return artifact;
        },
        context.signal === undefined ? {} : { signal: context.signal },
      );
      return { ...produced, path: saved.path, name: saved.name, bytes: saved.bytes };
    } catch (error) {
      throw stage.converted ? publishFailure(error, context.signal) : error;
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
