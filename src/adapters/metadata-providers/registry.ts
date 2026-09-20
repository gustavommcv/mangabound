import { MangaDexProvider } from './mangadex/provider';

import type { MetadataProviderPort } from '@/application/ports/metadata-provider';

/**
 * The online sources this build offers, in the order they are listed. Adding one means adding a
 * line here and a folder next to `mangadex/` (docs/adding-a-metadata-provider.md). Nothing is
 * discovered or loaded at run time, and none of them is used until a person chooses it and searches.
 */
export function createMetadataProviders(
  fetchImpl?: typeof globalThis.fetch,
): readonly MetadataProviderPort[] {
  return [new MangaDexProvider(fetchImpl)];
}
