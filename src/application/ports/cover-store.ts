import type { AttachedCover, CoverOrigin, CoverSlot } from '@/domain/book-covers';

/** A cover as the store keeps it: what the person sees of it, and where its copy is. */
export interface StoredCover extends AttachedCover {
  readonly path: string;
}

/**
 * The covers a person attached to the books of an item, kept by the app itself. An item is known
 * by its path: a manga folder, a title's folder inside a library, or a loose CBZ.
 */
export interface CoverStorePort {
  /** The covers kept for an item, in book order, leaving out any whose image is gone. */
  list(itemPath: string): Promise<readonly StoredCover[]>;
  /** Copies the image and makes it that book's cover, in the place of the one it had. */
  attach(
    itemPath: string,
    cover: { readonly slot: CoverSlot; readonly origin: CoverOrigin; readonly sourcePath: string },
  ): Promise<void>;
  remove(itemPath: string, slot: CoverSlot): Promise<void>;
}

export interface CoverImage {
  readonly path: string;
  readonly name: string;
  /** Whether the file begins the way an image does: one that does not would stop the book it is for. */
  readonly readable: boolean;
}

export interface CoverSourcePort {
  /** The images among these paths. A folder stands for the images directly inside it. */
  imagesIn(paths: readonly string[]): Promise<readonly CoverImage[]>;
}
