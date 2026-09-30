export interface SavedBookFile {
  /** Where the book now lives inside the library. */
  readonly path: string;
  /** The file name, used as the book's name in the catalog. */
  readonly name: string;
  readonly bytes: number;
}

/**
 * Puts finished book files into a library. A book is only ever published complete, so a cancelled
 * or failed run never leaves a half-written one behind, and it never replaces a book that is
 * already there: a later book with the same name gets a free one instead (ADR 0029).
 */
export interface BookFileStorePort {
  /**
   * Publishes a joined volume. Only used when no conversion step follows the joining of volumes:
   * mangabind writes into its own scratch workspace (ADR 0006), and the file is copied from there.
   */
  saveBook(
    request: { readonly sourcePath: string; readonly libraryPath: string },
    options?: { readonly signal?: AbortSignal },
  ): Promise<SavedBookFile>;

  /**
   * Runs `produce` with an empty private folder inside the library for one tool to write its book
   * into, then publishes the file `produce` reports. The folder is always removed afterwards.
   */
  stageBook<T extends { readonly path: string }>(
    request: { readonly libraryPath: string },
    produce: (stagingPath: string) => Promise<T>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<{ readonly produced: T; readonly saved: SavedBookFile }>;
}
