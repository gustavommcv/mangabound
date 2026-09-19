import { ExternalMetadataProvider } from './metadata-provider';

import type { MetadataProviderPort } from '@/application/ports/metadata-provider';

/**
 * The metadata providers this build offers. Nothing is offered until one is configured, so a
 * fresh install never shows a lookup that has nowhere to go.
 */
export function createMetadataProviders(
  env: Readonly<Record<string, string | undefined>>,
  fetchImpl?: typeof globalThis.fetch,
): readonly MetadataProviderPort[] {
  const baseUrl = env.METADATA_API_BASE_URL?.trim();
  if (baseUrl === undefined || baseUrl === '') return [];
  return [new ExternalMetadataProvider(fetchImpl, baseUrl)];
}
