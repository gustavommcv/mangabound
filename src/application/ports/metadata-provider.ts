import type { VolumeSuggestion } from '@/domain/mapping';

export interface MetadataProviderDescriptor {
  /** Stable, lowercase id the renderer and the IPC contract refer to the provider by. */
  readonly id: string;
  /** Name shown to the user, including in "Searching sends the title to <name>". */
  readonly displayName: string;
}

export interface MetadataSearchResult {
  readonly id: string;
  readonly title: string;
  readonly provider: string;
}

export interface MetadataProviderPort {
  readonly descriptor: MetadataProviderDescriptor;
  search(title: string, signal?: AbortSignal): Promise<readonly MetadataSearchResult[]>;
  suggestVolumes(
    workId: string,
    signal?: AbortSignal,
  ): Promise<{ readonly volumes: readonly VolumeSuggestion[] }>;
}
