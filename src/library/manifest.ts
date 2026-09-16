import { z } from 'zod';

import type { BookFormat } from '@/domain/conversion';

export const libraryManifestSchemaVersion = 1 as const;

export interface LibraryBookEntry {
  readonly relativePath: string;
  readonly title: string;
  readonly author: string;
  readonly format: BookFormat;
  readonly bytes: number;
  readonly convertedAt: string;
}

export interface LibraryManifest {
  readonly schemaVersion: typeof libraryManifestSchemaVersion;
  readonly books: readonly LibraryBookEntry[];
}

export const emptyLibraryManifest: LibraryManifest = {
  schemaVersion: libraryManifestSchemaVersion,
  books: [],
};

export type LibraryIndexErrorCode =
  'malformed_json' | 'invalid_manifest' | 'unsupported_schema_version' | 'path_outside_library';

export class LibraryIndexError extends Error {
  constructor(
    readonly code: LibraryIndexErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'LibraryIndexError';
  }
}

const libraryBookEntrySchema = z.object({
  relativePath: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  format: z.enum(['epub', 'cbz', 'pdf']),
  bytes: z.number().int().nonnegative(),
  convertedAt: z.string().min(1),
});

const libraryManifestSchema = z.object({
  schemaVersion: z.number().int(),
  books: z.array(libraryBookEntrySchema),
});

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new LibraryIndexError('malformed_json', 'The library catalog is not valid JSON.', {
      cause: error,
    });
  }
}

export function parseLibraryManifest(input: string): LibraryManifest {
  const payload = parseJson(input);
  const result = libraryManifestSchema.safeParse(payload);
  if (!result.success) {
    throw new LibraryIndexError(
      'invalid_manifest',
      'The library catalog does not match the expected shape.',
      { cause: result.error },
    );
  }
  if (result.data.schemaVersion !== libraryManifestSchemaVersion) {
    throw new LibraryIndexError(
      'unsupported_schema_version',
      `The library catalog schema version ${String(result.data.schemaVersion)} is not supported.`,
    );
  }
  return { schemaVersion: libraryManifestSchemaVersion, books: result.data.books };
}

export function serializeLibraryManifest(manifest: LibraryManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
