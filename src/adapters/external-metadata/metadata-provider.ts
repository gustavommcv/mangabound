import { MetadataProviderError, parseAggregateResponse, parseSearchResponse } from './protocol';

import type {
  MetadataProviderPort,
  MetadataSearchResult,
} from '@/application/ports/metadata-provider';
import type { VolumeSuggestion } from '@/domain/mapping';

// A placeholder that only tests rely on: the app registers a provider only when a real base URL
// is configured (see registry.ts), so this default is never contacted at runtime.
const defaultBaseUrl = 'https://api.external-metadata.org';
const userAgent = 'Mangabound (+https://github.com/gustavommcv/mangabound)';

export class ExternalMetadataProvider implements MetadataProviderPort {
  readonly descriptor = { id: 'external', displayName: 'External API' } as const;

  constructor(
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch,
    private readonly baseUrl: string = defaultBaseUrl,
  ) {}

  async search(title: string, signal?: AbortSignal): Promise<readonly MetadataSearchResult[]> {
    const body = await this.request(
      `${this.baseUrl}/manga?title=${encodeURIComponent(title)}&limit=10`,
      signal,
    );
    return parseSearchResponse(body).data.map((manga) => ({
      id: manga.id,
      title: manga.attributes.title.en ?? Object.values(manga.attributes.title)[0] ?? manga.id,
      provider: 'External API',
    }));
  }

  async suggestVolumes(
    id: string,
    signal?: AbortSignal,
  ): Promise<{ readonly volumes: readonly VolumeSuggestion[] }> {
    const body = await this.request(
      `${this.baseUrl}/manga/${encodeURIComponent(id)}/aggregate?translatedLanguage[]=en`,
      signal,
    );
    const volumes: VolumeSuggestion[] = [];
    for (const volume of Object.values(parseAggregateResponse(body).volumes)) {
      const volumeNumber = Number(volume.volume);
      if (!Number.isFinite(volumeNumber)) continue;
      const chapterNumbers = Object.values(volume.chapters)
        .map((chapter) => Number(chapter.chapter))
        .filter((chapterNumber) => Number.isFinite(chapterNumber));
      if (chapterNumbers.length === 0) continue;
      volumes.push({ number: volume.volume, chapterNumbers });
    }
    return { volumes };
  }

  private async request(url: string, signal?: AbortSignal): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new MetadataProviderError(
        'network_error',
        'Could not reach external metadata service.',
        true,
        {
          cause: error,
        },
      );
    }
    if (response.status === 429) {
      throw new MetadataProviderError(
        'rate_limited',
        'External metadata service is rate-limiting requests. Try again shortly.',
        true,
      );
    }
    if (!response.ok) {
      throw new MetadataProviderError(
        'http_error',
        `External metadata service returned an unexpected status (${String(response.status)}).`,
        true,
      );
    }
    return response.text();
  }
}
