import {
  type BookDetails,
  isLanguageTag,
  maxDetailLength,
  persistableDetails,
} from '@/domain/book-details';

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The author and language a mangabind.json holds under `manga`, where mangabind itself reads
 * nothing but leaves any other key alone. A file that cannot be read this way, or a value that is
 * not usable, is taken as holding nothing: reading a folder never fails for want of them.
 */
export function readStoredDetails(text: string): BookDetails {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return {};
  }
  const manga = isRecord(document) ? document.manga : undefined;
  if (!isRecord(manga)) return {};
  const author = typeof manga.author === 'string' ? manga.author.trim() : '';
  const language = typeof manga.language === 'string' ? manga.language.trim() : '';
  return {
    ...(author === '' || author.length > maxDetailLength ? {} : { author }),
    ...(language === '' || !isLanguageTag(language) ? {} : { language }),
  };
}

const stringify = (document: Json): string => `${JSON.stringify(document, null, 2)}\n`;

/**
 * The mapping's metadata as it is about to be written, with the author and language the file it
 * replaces carried over, so saving the volumes of a folder never forgets who wrote it.
 */
export function carryStoredDetails(existing: string | undefined, next: string): string {
  const stored = existing === undefined ? {} : readStoredDetails(existing);
  if (Object.keys(stored).length === 0) return next;
  const document = JSON.parse(next) as Json;
  document.manga = { ...(isRecord(document.manga) ? document.manga : {}), ...stored };
  return stringify(document);
}

/**
 * The file once the folder's author and language are these, or undefined when nothing is left that
 * is worth a file: it holds no volumes, no source, no manga information and no key this code does
 * not know. Everything else in a file is kept as it was, and a file that is not JSON is refused
 * rather than overwritten.
 */
export function withStoredDetails(
  existing: string | undefined,
  details: BookDetails,
): string | undefined {
  const kept = persistableDetails(details);
  let document: Json;
  if (existing === undefined) {
    document = { schema_version: 1, volumes: [] };
  } else {
    const parsed: unknown = JSON.parse(existing);
    if (!isRecord(parsed)) throw new TypeError('mangabind.json is not a JSON object.');
    document = parsed;
  }
  const manga: Json = isRecord(document.manga) ? { ...document.manga } : {};
  delete manga.author;
  delete manga.language;
  Object.assign(manga, kept);

  const { manga: _previous, ...rest } = document;
  void _previous;
  const next: Json = {
    ...(rest.schema_version === undefined ? {} : { schema_version: rest.schema_version }),
    ...(Object.keys(manga).length === 0 ? {} : { manga }),
    ...rest,
  };
  const onlyWhatThisMade = Object.keys(next).every(
    (key) =>
      key === 'schema_version' ||
      (key === 'volumes' && Array.isArray(next.volumes) && next.volumes.length === 0),
  );
  return onlyWhatThisMade ? undefined : stringify(next);
}
