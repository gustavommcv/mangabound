import { z } from 'zod';

import { MetadataProviderError } from '../errors';

// Some endpoints represent an empty keyed collection as `[]` instead of `{}`.
function mapOrEmpty<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.preprocess(
    (value) => (Array.isArray(value) ? {} : value),
    z.record(z.string(), valueSchema),
  );
}

const mangaSchema = z
  .object({
    id: z.string(),
    type: z.literal('manga'),
    attributes: z.object({ title: z.record(z.string(), z.string()) }).passthrough(),
  })
  .passthrough();

export const searchResponseSchema = z
  .object({
    data: z.array(mangaSchema),
  })
  .passthrough();

const aggregateChapterSchema = z.object({ chapter: z.string() }).passthrough();

const aggregateVolumeSchema = z
  .object({
    volume: z.string(),
    chapters: mapOrEmpty(aggregateChapterSchema),
  })
  .passthrough();

export const aggregateResponseSchema = z
  .object({
    volumes: mapOrEmpty(aggregateVolumeSchema),
  })
  .passthrough();

export type SearchResponse = z.infer<typeof searchResponseSchema>;
export type AggregateResponse = z.infer<typeof aggregateResponseSchema>;

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new MetadataProviderError('malformed_json', 'MangaDex returned malformed JSON.', true, {
      cause: error,
    });
  }
}

export function parseSearchResponse(input: string): SearchResponse {
  const result = searchResponseSchema.safeParse(parseJson(input));
  if (!result.success) {
    throw new MetadataProviderError(
      'invalid_payload',
      'MangaDex returned an unexpected search response.',
      true,
      { cause: result.error },
    );
  }
  return result.data;
}

export function parseAggregateResponse(input: string): AggregateResponse {
  const result = aggregateResponseSchema.safeParse(parseJson(input));
  if (!result.success) {
    throw new MetadataProviderError(
      'invalid_payload',
      'MangaDex returned an unexpected volumes response.',
      true,
      { cause: result.error },
    );
  }
  return result.data;
}
