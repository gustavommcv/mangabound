import type {
  BindingBatchPlan,
  BindingBatchTitle,
  BindingPort,
} from '@/application/ports/conversion-tools';
import { type BookDetails, hasBookDetails } from '@/domain/book-details';
import {
  ConversionWorkflowError,
  type InputSelection,
  type InspectedInput,
  type InspectedTitle,
  type LibraryPlan,
} from '@/domain/conversion';
import { createMappingDraft, type MappingDraft, validateMapping } from '@/domain/mapping';

/** The manga folders of a library as last planned. Their paths never leave the workflow. */
interface LibraryState {
  readonly titles: readonly BindingBatchTitle[];
}

export interface ActiveSession {
  readonly selection: InputSelection;
  readonly trustedDraft?: MappingDraft;
  readonly workspaceId?: string;
  /** Set when the folder turned out to be a library rather than one manga. */
  readonly library?: LibraryState;
}

/** Own the inspected inputs, trusted paths and drafts, metadata saves and scratch lifetimes. */
export class InputSessions {
  private readonly sessions = new Map<string, ActiveSession>();

  constructor(
    private readonly binding: BindingPort,
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
    const library = await this.probeLibrary(selection.inputPath, inspection.draft, signal);
    if (library !== undefined) {
      // Reading the folder as one manga left a scratch copy behind that a library has no use for.
      await this.binding.release(inspection.workspaceId);
      this.sessions.set(sessionId, { selection, library: { titles: library.titles } });
      return {
        sessionId,
        displayName: selection.displayName,
        kind: 'library',
        titles: await this.summarize(library.titles),
        issues: library.issues,
      };
    }
    this.sessions.set(sessionId, {
      selection,
      trustedDraft: inspection.draft,
      workspaceId: inspection.workspaceId,
    });
    const details = await this.binding.readDetails(selection.inputPath);
    return {
      sessionId,
      displayName: selection.displayName,
      kind: 'folder',
      mapping: inspection.draft,
      ...(hasBookDetails(details) ? { details } : {}),
      issues: inspection.issues,
    };
  }

  /** What is told of each title of a library, with the author and language kept with its folder. */
  private summarize(titles: readonly BindingBatchTitle[]): Promise<InspectedTitle[]> {
    return Promise.all(
      titles.map(async (title) => {
        const details = await this.binding.readDetails(title.inputPath);
        return { ...summarizeTitle(title), ...(hasBookDetails(details) ? { details } : {}) };
      }),
    );
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

  /** Reads the library again, for instance after a title's mapping was saved. */
  async planLibrary(sessionId: string, signal?: AbortSignal): Promise<LibraryPlan> {
    const { session, library } = this.librarySession(sessionId);
    const plan = await this.binding.planBatch(session.selection.inputPath, signal);
    const titles = plan.titles.filter((title) => title.draft.chapters.length > 0);
    this.sessions.set(sessionId, { ...session, library: { ...library, titles } });
    return { titles: await this.summarize(titles), issues: plan.issues };
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

  /**
   * Keeps the author and language typed for a folder, or for one title of a library, with that
   * folder (ADR 0032). The folder is looked up in what the workflow read: only a folder can keep
   * them, and a loose CBZ has none.
   */
  async saveDetails(sessionId: string, details: BookDetails, title?: string): Promise<void> {
    const session = this.requireSession(sessionId);
    if (title !== undefined) {
      const known = this.librarySession(sessionId).library.titles.find(
        (candidate) => candidate.title === title,
      );
      if (known === undefined) {
        throw new ConversionWorkflowError(
          'title_not_found',
          'That title is no longer in the library. Choose the library again.',
        );
      }
      await this.binding.writeDetails(known.inputPath, details);
      return;
    }
    if (session.selection.kind !== 'folder' || session.library !== undefined) {
      throw new ConversionWorkflowError(
        'unsupported_mode',
        'The author and language are kept with a folder, and this input is not one.',
      );
    }
    await this.binding.writeDetails(session.selection.inputPath, details);
  }

  /**
   * Where an item is on disk: the folder or CBZ of a session, or the folder of one title of a
   * library. It is what the app's own records about the item are kept under.
   */
  itemPath(sessionId: string, title?: string): string {
    const session = this.requireSession(sessionId);
    if (title !== undefined) {
      const known = this.librarySession(sessionId).library.titles.find(
        (candidate) => candidate.title === title,
      );
      if (known === undefined) {
        throw new ConversionWorkflowError(
          'title_not_found',
          'That title is no longer in the library. Choose the library again.',
        );
      }
      return known.inputPath;
    }
    if (session.library !== undefined) {
      throw new ConversionWorkflowError(
        'unsupported_mode',
        'A library is made of titles; choose one of them.',
      );
    }
    return session.selection.inputPath;
  }

  requireSession(sessionId: string): ActiveSession {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      throw new ConversionWorkflowError(
        'session_not_found',
        'This input is no longer available. Choose it again.',
      );
    }
    return session;
  }

  librarySession(sessionId: string): {
    readonly session: ActiveSession;
    readonly library: LibraryState;
  } {
    const session = this.requireSession(sessionId);
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

/** What the renderer is told about a title: everything but where it lives. */
function summarizeTitle(title: BindingBatchTitle): InspectedTitle {
  return {
    title: title.title,
    draft: title.draft,
    volumes: title.volumes,
    issues: title.issues,
  };
}

export function trustedMapping(trusted: MappingDraft, submitted: MappingDraft): MappingDraft {
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
