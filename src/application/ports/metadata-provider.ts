import type { VolumeSuggestion } from '@/domain/mapping';

export interface MetadataSearchResult {
  readonly id: string;
  readonly title: string;
  readonly provider: string;
}

export interface MetadataProviderPort {
  search(title: string, signal?: AbortSignal): Promise<readonly MetadataSearchResult[]>;
  suggestVolumes(
    id: string,
    signal?: AbortSignal,
  ): Promise<{ readonly volumes: readonly VolumeSuggestion[] }>;
}
