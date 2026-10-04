import type { BookFileStorePort } from '@/application/ports/book-file-store';
import type { BindingPort, ConversionPort } from '@/application/ports/conversion-tools';
import type { CoverSourcePort, CoverStorePort } from '@/application/ports/cover-store';
import { BookCovers, keepsNoCovers } from '@/application/workflows/book-covers';
import { BookProduction } from '@/application/workflows/book-production';
import { InputSessions } from '@/application/workflows/input-sessions';
import { LibraryRun } from '@/application/workflows/library-run';
import { SingleInputRun } from '@/application/workflows/single-run';
import type { BookDetails } from '@/domain/book-details';
import type { InputSelection, InspectedInput, LibraryPlan } from '@/domain/conversion';
import type { MappingDraft } from '@/domain/mapping';

/** Stable entry point for reading, planning, converting and releasing inputs of either kind. */
export class ConversionWorkflow {
  private readonly sessions: InputSessions;
  private readonly singleRun: SingleInputRun;
  private readonly libraryRun: LibraryRun;
  /** The covers a person attaches to the books of an item, and the ones a run then uses. */
  readonly covers: BookCovers;

  constructor(
    binding: BindingPort,
    conversion: ConversionPort,
    createId: () => string,
    bookFiles: BookFileStorePort,
    maxParallelConversions = 1,
    coverStore: CoverStorePort & CoverSourcePort = keepsNoCovers,
  ) {
    this.sessions = new InputSessions(binding, createId);
    this.covers = new BookCovers(this.sessions, coverStore, coverStore);
    const books = new BookProduction(conversion, createId, bookFiles, maxParallelConversions);
    this.singleRun = new SingleInputRun(binding, conversion, this.sessions, books, this.covers);
    this.libraryRun = new LibraryRun(binding, this.sessions, books, this.covers);
  }

  inspect(selection: InputSelection, signal?: AbortSignal): Promise<InspectedInput> {
    return this.sessions.inspect(selection, signal);
  }

  convert(...args: Parameters<SingleInputRun['convert']>): ReturnType<SingleInputRun['convert']> {
    return this.singleRun.convert(...args);
  }

  plan(...args: Parameters<SingleInputRun['plan']>): ReturnType<SingleInputRun['plan']> {
    return this.singleRun.plan(...args);
  }

  planLibrary(sessionId: string, signal?: AbortSignal): Promise<LibraryPlan> {
    return this.sessions.planLibrary(sessionId, signal);
  }

  writeTitleMapping(sessionId: string, title: string, mapping: MappingDraft): Promise<void> {
    return this.sessions.writeTitleMapping(sessionId, title, mapping);
  }

  saveDetails(sessionId: string, details: BookDetails, title?: string): Promise<void> {
    return this.sessions.saveDetails(sessionId, details, title);
  }

  convertLibrary(...args: Parameters<LibraryRun['convert']>): ReturnType<LibraryRun['convert']> {
    return this.libraryRun.convert(...args);
  }

  release(sessionId: string): Promise<void> {
    return this.sessions.release(sessionId);
  }

  releaseAll(): Promise<void> {
    return this.sessions.releaseAll();
  }
}
