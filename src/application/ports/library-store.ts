import type { LibraryBookEntry, LibraryManifest } from '@/library/manifest';

export interface LibraryStorePort {
  read(libraryPath: string): Promise<LibraryManifest>;
  publish(libraryPath: string, entry: LibraryBookEntry): Promise<LibraryManifest>;
  /**
   * Comic/book files sitting in the folder that the catalog does not know about (never converted
   * here, or just copied in). Weaker metadata than a tracked entry: the file name as the title, no
   * known author, and the file's own modified time in place of a real conversion time.
   */
  scanUntracked(
    libraryPath: string,
    manifest: LibraryManifest,
  ): Promise<readonly LibraryBookEntry[]>;
}
