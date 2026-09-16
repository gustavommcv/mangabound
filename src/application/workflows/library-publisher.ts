import type { LibraryStorePort } from '@/application/ports/library-store';
import type { ConversionArtifact } from '@/domain/conversion';
import type { LibraryManifest } from '@/library/manifest';
import { toLibraryRelativePath } from '@/library/paths';

export class LibraryPublisher {
  constructor(
    private readonly store: LibraryStorePort,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  publish(libraryPath: string, artifact: ConversionArtifact): Promise<LibraryManifest> {
    const relativePath = toLibraryRelativePath(libraryPath, artifact.path);
    return this.store.publish(libraryPath, {
      relativePath,
      title: artifact.title,
      author: artifact.author,
      format: artifact.format,
      bytes: artifact.bytes,
      convertedAt: this.now(),
    });
  }
}
