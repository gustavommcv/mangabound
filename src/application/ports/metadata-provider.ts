import type { VolumeSuggestion } from '@/domain/mapping';

export interface MetadataProviderDescriptor {
  /** Stable, lowercase id the renderer and the IPC contract refer to the provider by. */
  readonly id: string;
  /** Name shown to the user, including in "Searching sends the title to <name>". */
  readonly displayName: string;
  /**
   * The service's own site, `https` only. It is listed with the name, and it is what the credit
   * link opens: the main process opens this address for a provider, never one the page supplies.
   */
  readonly homepage: string;
  /** What the service is, in a few words, shown in the list of sources. */
  readonly description: string;
}

export interface MetadataSearchResult {
  readonly id: string;
  readonly title: string;
  /** The `id` of the provider that found it, which is also what the mapping records as its source. */
  readonly provider: string;
}

/**
 * A source of chapter-to-volume data. This is all a provider can do: find a work by its title, and
 * say which chapters of it belong to which volume. There is deliberately no way to ask for
 * chapters, pages or images (ADR 0005: Mangabound is not a downloader).
 */
export interface MetadataProviderPort {
  readonly descriptor: MetadataProviderDescriptor;
  search(title: string, signal?: AbortSignal): Promise<readonly MetadataSearchResult[]>;
  suggestVolumes(
    workId: string,
    options?: {
      /** The language the folders declare, such as "pt-br". A provider without languages ignores it. */
      readonly language?: string;
      readonly signal?: AbortSignal;
    },
  ): Promise<{ readonly volumes: readonly VolumeSuggestion[] }>;
}
