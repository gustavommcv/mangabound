export interface SavedBookFile {
  /** Where the book now lives inside the library. */
  readonly path: string;
  /** The file name, used as the book's name in the catalog. */
  readonly name: string;
  readonly bytes: number;
}

/**
 * Puts a finished book file into a library. Only used when no conversion step follows the
 * joining of volumes: mangabind writes into its own scratch workspace (ADR 0006), and the file
 * is published from there so a cancelled or failed run never leaves a half-written book behind.
 */
export interface BookFileStorePort {
  saveBook(
    request: { readonly sourcePath: string; readonly libraryPath: string },
    options?: { readonly signal?: AbortSignal },
  ): Promise<SavedBookFile>;
}
