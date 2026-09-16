import { describe, expect, it } from 'vitest';

import {
  emptyLibraryManifest,
  type LibraryManifest,
  libraryManifestSchemaVersion,
  parseLibraryManifest,
  serializeLibraryManifest,
} from '@/library/manifest';

const sampleManifest: LibraryManifest = {
  schemaVersion: libraryManifestSchemaVersion,
  books: [
    {
      relativePath: 'A Quiet Journey/Vol.01.epub',
      title: 'A Quiet Journey',
      author: 'Unknown',
      format: 'epub',
      bytes: 12345,
      convertedAt: '2026-09-16T10:00:00.000Z',
    },
  ],
};

describe('library manifest', () => {
  it('round-trips a valid manifest through serialize and parse', () => {
    const parsed = parseLibraryManifest(serializeLibraryManifest(sampleManifest));
    expect(parsed).toEqual(sampleManifest);
  });

  it('exposes an empty manifest with the current schema version', () => {
    expect(emptyLibraryManifest).toEqual({
      schemaVersion: libraryManifestSchemaVersion,
      books: [],
    });
  });

  it('throws malformed_json for input that is not valid JSON', () => {
    expect(() => parseLibraryManifest('not json')).toThrowError(
      expect.objectContaining({ code: 'malformed_json' }),
    );
  });

  it('throws invalid_manifest when the top-level shape does not match', () => {
    expect(() => parseLibraryManifest(JSON.stringify({ books: 'not-an-array' }))).toThrowError(
      expect.objectContaining({ code: 'invalid_manifest' }),
    );
  });

  it('throws invalid_manifest when a book entry has the wrong field types', () => {
    const payload = {
      schemaVersion: libraryManifestSchemaVersion,
      books: [{ ...sampleManifest.books[0], bytes: 'not-a-number' }],
    };
    expect(() => parseLibraryManifest(JSON.stringify(payload))).toThrowError(
      expect.objectContaining({ code: 'invalid_manifest' }),
    );
  });

  it('throws invalid_manifest for a non-object payload', () => {
    expect(() => parseLibraryManifest(JSON.stringify([1, 2, 3]))).toThrowError(
      expect.objectContaining({ code: 'invalid_manifest' }),
    );
  });

  it('throws unsupported_schema_version for a future schema version', () => {
    const payload = { schemaVersion: libraryManifestSchemaVersion + 1, books: [] };
    expect(() => parseLibraryManifest(JSON.stringify(payload))).toThrowError(
      expect.objectContaining({ code: 'unsupported_schema_version' }),
    );
  });
});
