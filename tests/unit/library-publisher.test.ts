import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { LibraryStorePort } from '@/application/ports/library-store';
import { LibraryPublisher } from '@/application/workflows/library-publisher';
import type { ConversionArtifact } from '@/domain/conversion';
import { libraryManifestSchemaVersion } from '@/library/manifest';

const libraryRoot = path.resolve('/library');

function artifact(overrides: Partial<ConversionArtifact> = {}): ConversionArtifact {
  return {
    id: 'artifact-1',
    name: 'Vol.01.epub',
    path: path.join(libraryRoot, 'Manga', 'Vol.01.epub'),
    bytes: 100,
    format: 'epub',
    title: 'Manga',
    author: 'Unknown',
    ...overrides,
  };
}

describe('LibraryPublisher', () => {
  it('derives a library entry from the artifact using the injected clock', async () => {
    const publish = vi.fn((_libraryPath: string, entry: unknown) =>
      Promise.resolve({ schemaVersion: libraryManifestSchemaVersion, books: [entry] }),
    );
    const store: LibraryStorePort = {
      read: vi.fn(),
      publish: publish as LibraryStorePort['publish'],
    };
    const publisher = new LibraryPublisher(store, () => '2026-09-16T12:00:00.000Z');

    await publisher.publish(libraryRoot, artifact());

    expect(publish).toHaveBeenCalledWith(libraryRoot, {
      relativePath: 'Manga/Vol.01.epub',
      title: 'Manga',
      author: 'Unknown',
      format: 'epub',
      bytes: 100,
      convertedAt: '2026-09-16T12:00:00.000Z',
    });
  });

  it('uses the real clock by default and propagates a rejection from the store', async () => {
    const store: LibraryStorePort = {
      read: vi.fn(),
      publish: vi.fn(() => Promise.reject(new Error('disk full'))),
    };
    const publisher = new LibraryPublisher(store);

    await expect(publisher.publish(libraryRoot, artifact())).rejects.toThrow('disk full');
  });
});
