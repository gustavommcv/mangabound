import { requestText } from '../http';

import { parseAggregateResponse, parseSearchResponse, type AggregateResponse } from './protocol';

import type {
  MetadataProviderPort,
  MetadataSearchResult,
} from '@/application/ports/metadata-provider';
import type { VolumeSuggestion } from '@/domain/mapping';

/**
 * MangaDex's public API, https://api.mangadex.org/docs/. Its rules for third-party apps, as read
 * when this was written: credit MangaDex, run no ads and sell no access, send a real user agent
 * (see http.ts), stay near five requests a second, and do not download what scanlation groups
 * publish. This provider asks two questions, which title a work has and which chapters its volumes
 * hold, and never touches chapters, pages or images.
 */
const apiBaseUrl = 'https://api.mangadex.org';

export const mangaDexDescriptor = {
  id: 'mangadex',
  displayName: 'MangaDex',
  homepage: 'https://mangadex.org',
  description: 'Community catalogue of manga, with volume and chapter data',
} as const;

/** The language volumes are looked up in when the folders declare none, or it has none to give. */
const fallbackLanguage = 'en';

function volumesOf(aggregate: AggregateResponse): VolumeSuggestion[] {
  const volumes: VolumeSuggestion[] = [];
  for (const volume of Object.values(aggregate.volumes)) {
    // Chapters MangaDex has not put in a volume are filed under "none", which is not a number.
    const volumeNumber = Number(volume.volume);
    if (!Number.isFinite(volumeNumber)) continue;
    const chapterNumbers = Object.values(volume.chapters)
      .map((chapter) => Number(chapter.chapter))
      .filter((chapterNumber) => Number.isFinite(chapterNumber));
    if (chapterNumbers.length === 0) continue;
    volumes.push({ number: volume.volume, chapterNumbers });
  }
  return volumes;
}

export class MangaDexProvider implements MetadataProviderPort {
  readonly descriptor = mangaDexDescriptor;

  constructor(private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch) {}

  async search(title: string, signal?: AbortSignal): Promise<readonly MetadataSearchResult[]> {
    const body = await requestText(this.fetchImpl, {
      url: `${apiBaseUrl}/manga?title=${encodeURIComponent(title)}&limit=10&order%5Brelevance%5D=desc`,
      serviceName: this.descriptor.displayName,
      ...(signal === undefined ? {} : { signal }),
    });
    return parseSearchResponse(body).data.map((manga) => ({
      id: manga.id,
      title: manga.attributes.title.en ?? Object.values(manga.attributes.title)[0] ?? manga.id,
      provider: this.descriptor.id,
    }));
  }

  /**
   * A work is grouped into volumes differently in each translation (a real one has 13 volumes in
   * English and 21 in Brazilian Portuguese), so the volumes are asked for in the language the
   * folders declare. When that language has none, English is tried before giving up.
   */
  async suggestVolumes(
    id: string,
    options: { readonly language?: string; readonly signal?: AbortSignal } = {},
  ): Promise<{ readonly volumes: readonly VolumeSuggestion[] }> {
    const wanted = options.language?.toLowerCase();
    const languages =
      wanted === undefined ? [fallbackLanguage] : [...new Set([wanted, fallbackLanguage])];
    for (const language of languages) {
      const body = await requestText(this.fetchImpl, {
        url: `${apiBaseUrl}/manga/${encodeURIComponent(id)}/aggregate?translatedLanguage%5B%5D=${encodeURIComponent(language)}`,
        serviceName: this.descriptor.displayName,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      const volumes = volumesOf(parseAggregateResponse(body));
      if (volumes.length > 0) return { volumes };
    }
    return { volumes: [] };
  }
}
