import type { CoverSourcePort, CoverStorePort } from '@/application/ports/cover-store';
import type { InputSessions } from '@/application/workflows/input-sessions';
import {
  type AttachedCover,
  type CoverSlot,
  coverTypesSentence,
  describeFolderImport,
  planFolderImport,
} from '@/domain/book-covers';

/** The covers of an item after something was done to them, and what there is to say about it. */
export interface CoverChange {
  readonly covers: readonly AttachedCover[];
  readonly note?: string;
}

/** Where the cover of each book of an item is, for a run to hand to mangapress. */
export interface CoverLookup {
  pathsFor(itemPath: string): Promise<ReadonlyMap<CoverSlot, string>>;
}

/**
 * The covers a person gives the books of an item (ADR 0040): one chosen for a book, or a folder
 * taken in order. The item is found from its session, never from a path the screen names, and
 * what goes back to the screen is each cover's name and origin, never where it is kept.
 */
export class BookCovers implements CoverLookup {
  constructor(
    private readonly sessions: Pick<InputSessions, 'itemPath'>,
    private readonly store: CoverStorePort,
    private readonly sources: CoverSourcePort,
  ) {}

  async list(sessionId: string, title?: string): Promise<readonly AttachedCover[]> {
    return this.attached(this.sessions.itemPath(sessionId, title));
  }

  /** One image, picked for one book: it stays until the person changes or removes it. */
  async choose(
    target: { readonly sessionId: string; readonly title?: string },
    slot: CoverSlot,
    sourcePath: string,
  ): Promise<CoverChange> {
    const itemPath = this.sessions.itemPath(target.sessionId, target.title);
    const [image] = await this.sources.imagesIn([sourcePath]);
    if (image === undefined) {
      return { covers: await this.attached(itemPath), note: coverTypesSentence };
    }
    await this.store.attach(itemPath, { slot, origin: 'chosen', sourcePath: image.path });
    return { covers: await this.attached(itemPath) };
  }

  /** A folder, or several images: taken in name order, one for each book in turn. */
  async takeInOrder(
    target: { readonly sessionId: string; readonly title?: string },
    slots: readonly CoverSlot[],
    paths: readonly string[],
  ): Promise<CoverChange> {
    const itemPath = this.sessions.itemPath(target.sessionId, target.title);
    const plan = planFolderImport(
      slots,
      await this.attached(itemPath),
      await this.sources.imagesIn(paths),
    );
    for (const { slot, image } of plan.assignments) {
      await this.store.attach(itemPath, { slot, origin: 'folder', sourcePath: image.path });
    }
    const note = describeFolderImport(plan);
    return { covers: await this.attached(itemPath), ...(note === undefined ? {} : { note }) };
  }

  /**
   * What was dropped on the covers: a single image on a book is chosen for that book, and anything
   * else is taken in order, as a folder is.
   */
  async drop(
    target: { readonly sessionId: string; readonly title?: string },
    slots: readonly CoverSlot[],
    slot: CoverSlot | undefined,
    paths: readonly string[],
  ): Promise<CoverChange> {
    const [only, ...others] = paths;
    if (slot !== undefined && only !== undefined && others.length === 0) {
      const [image] = await this.sources.imagesIn([only]);
      // A folder dropped on a book holds several images or none: it is not that book's cover.
      if (image?.path === only) return this.choose(target, slot, only);
    }
    return this.takeInOrder(target, slots, paths);
  }

  async remove(
    target: { readonly sessionId: string; readonly title?: string },
    slot: CoverSlot,
  ): Promise<CoverChange> {
    const itemPath = this.sessions.itemPath(target.sessionId, target.title);
    await this.store.remove(itemPath, slot);
    return { covers: await this.attached(itemPath) };
  }

  async pathsFor(itemPath: string): Promise<ReadonlyMap<CoverSlot, string>> {
    const covers = await this.store.list(itemPath);
    return new Map(covers.map((cover) => [cover.slot, cover.path] as const));
  }

  private async attached(itemPath: string): Promise<readonly AttachedCover[]> {
    const covers = await this.store.list(itemPath);
    return covers.map(({ slot, name, origin }) => ({ slot, name, origin }));
  }
}

/** A store that keeps nothing, for a workflow built without one: every book uses its first image. */
export const keepsNoCovers: CoverStorePort & CoverSourcePort = {
  list: () => Promise.resolve([]),
  attach: () => Promise.resolve(),
  remove: () => Promise.resolve(),
  imagesIn: () => Promise.resolve([]),
};
