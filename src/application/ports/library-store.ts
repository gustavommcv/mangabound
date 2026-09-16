import type { LibraryBookEntry, LibraryManifest } from '@/library/manifest';

export interface LibraryStorePort {
  read(libraryPath: string): Promise<LibraryManifest>;
  publish(libraryPath: string, entry: LibraryBookEntry): Promise<LibraryManifest>;
}
