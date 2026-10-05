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

/** The same value with every object's keys in order, so that two documents can be compared. */
function inKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(inKeyOrder);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, inKeyOrder(value[key])]),
  );
}

/**
 * The mapping's metadata as it is about to be written, laid over the file it replaces. The file is
 * the person's, in their folder, and may hold more than the app makes: the author and language, but
 * also a source, a note on a volume, keys of their own or of another tool. Only what the mapping
 * says (the volumes and their chapters, the title, the source when it names one) is replaced; every
 * other key is kept, in the order the file had it. A file that is not a JSON object is refused, not
 * overwritten.
 */
export function carryStoredDetails(existing: string | undefined, next: string): string {
  if (existing === undefined) return next;
  const old: unknown = JSON.parse(existing);
  if (!isRecord(old)) throw new TypeError('mangabind.json is not a JSON object.');
  const mine = JSON.parse(next) as Json;

  const merged: Json = { ...old, ...mine };
  if (isRecord(old.manga) || isRecord(mine.manga)) {
    merged.manga = {
      ...(isRecord(old.manga) ? old.manga : {}),
      ...(isRecord(mine.manga) ? mine.manga : {}),
    };
  }
  if (Array.isArray(mine.volumes)) {
    const before = new Map<unknown, Json>(
      (Array.isArray(old.volumes) ? (old.volumes as unknown[]) : [])
        .filter(isRecord)
        .map((volume) => [volume.number, volume]),
    );
    // What the mapping made is always a list of objects: it is the app's own.
    merged.volumes = (mine.volumes as Json[]).map((volume) => ({
      ...before.get(volume.number),
      ...volume,
    }));
  }
  // Nothing of the old file is worth keeping: the mapping is written exactly as it was made.
  return JSON.stringify(inKeyOrder(merged)) === JSON.stringify(inKeyOrder(mine))
    ? next
    : stringify(merged);
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
