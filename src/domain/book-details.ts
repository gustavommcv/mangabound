/**
 * What names one book, or one series of them: a person types it for the item in hand rather than
 * keeping it as a preference (ADR 0030). Every field is optional, and a field left out means the
 * default: the title the tools derive from the input's name, no author, the language chosen in the
 * options.
 */
export interface BookDetails {
  readonly title?: string;
  readonly author?: string;
  /** A language tag such as "en-US" or "pt-BR". */
  readonly language?: string;
}

export const noBookDetails: BookDetails = Object.freeze({});

/** The most an author may hold; the same limit the command contract enforces. */
export const maxDetailLength = 300;

/**
 * The most a title may hold, in bytes of UTF-8. The tools name the book's file after its title, and
 * a file name is limited in bytes (255 on the usual systems), not in characters: a title of 90
 * Japanese characters is 270 bytes and converted every page before failing to save the book. The
 * limit leaves room for ` - Vol.01` and the extension.
 */
export const maxTitleBytes = 200;

const utf8 = new TextEncoder();

export function titleFits(title: string): boolean {
  return utf8.encode(title).length <= maxTitleBytes;
}

/** The title cut to what fits, at a whole character, never in the middle of one. */
export function clipTitle(title: string): string {
  let bytes = 0;
  let end = 0;
  for (const character of title) {
    bytes += utf8.encode(character).length;
    if (bytes > maxTitleBytes) break;
    end += character.length;
  }
  return title.slice(0, end);
}

/** Control characters: a NUL, a line break. Nobody types one into a title, and none can be in a file
 * name or a command argument; they come from text that was pasted or looked up. */
const controlCharacters = /\p{Cc}/gu;

export function hasControlCharacters(text: string): boolean {
  return /\p{Cc}/u.test(text);
}

/** A language tag such as "en" or "pt-BR": letters and digits in short groups joined by dashes. */
export const languageTagPattern = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/iu;
export const maxLanguageLength = 20;

export function isLanguageTag(value: string): boolean {
  return value.length <= maxLanguageLength && languageTagPattern.test(value);
}

/**
 * A language tag in the casing BCP 47 recommends: the language in lowercase, a four-letter script
 * in title case, a two-letter or three-digit region in uppercase, and anything else in lowercase
 * (`pt-br` is written `pt-BR`). Tags do not tell capitals from small letters, so this changes how a
 * tag is written and not what it means. Whatever is not a tag is returned as it is.
 */
export function canonicalLanguageTag(value: string): string {
  if (!isLanguageTag(value)) return value;
  return value
    .split('-')
    .map((subtag, index) => {
      if (index === 0) return subtag.toLowerCase();
      if (/^[a-z]{4}$/iu.test(subtag)) {
        return subtag.charAt(0).toUpperCase() + subtag.slice(1).toLowerCase();
      }
      if (/^[a-z]{2}$/iu.test(subtag) || /^\d{3}$/u.test(subtag)) return subtag.toUpperCase();
      return subtag.toLowerCase();
    })
    .join('-');
}

const trimmed = (value: string | undefined): string | undefined => {
  const text = value?.replace(controlCharacters, ' ').trim();
  return text === undefined || text === '' ? undefined : text;
};

/**
 * The details as they are kept: text trimmed, control characters turned into spaces, a title cut to
 * what a file name can hold, a field left blank taken as not set, and a language written the way
 * BCP 47 recommends.
 */
export function normalizeBookDetails(details: BookDetails): BookDetails {
  const title = trimmed(clipTitle(details.title ?? ''));
  const author = trimmed(details.author);
  const language = trimmed(details.language);
  return {
    ...(title === undefined ? {} : { title }),
    ...(author === undefined ? {} : { author }),
    ...(language === undefined ? {} : { language: canonicalLanguageTag(language) }),
  };
}

/**
 * The details that stay true of a series, and so are kept with its folder: the author and the
 * language. A title is not among them: what mangabind.json calls a manga's title is the folder's
 * name, and a title typed for a run is not a fact about the folder (ADR 0032).
 */
export function persistableDetails(details: BookDetails): BookDetails {
  const { author, language } = normalizeBookDetails(details);
  return {
    ...(author === undefined ? {} : { author }),
    ...(language === undefined ? {} : { language }),
  };
}

export function hasBookDetails(details: BookDetails | undefined): boolean {
  return details !== undefined && Object.keys(normalizeBookDetails(details)).length > 0;
}

/**
 * A volume's number the way mangabind writes it into a file name: two digits for a whole number,
 * the number itself otherwise (`01`, `12`, `1.5`).
 */
export function volumeLabel(volume: number): string {
  return Number.isInteger(volume) ? String(volume).padStart(2, '0') : String(volume);
}

/** The title of one volume of a series, in the shape mangabind names its files: `Title - Vol.01`. */
export function volumeBookTitle(seriesTitle: string, volume: number): string {
  return `${seriesTitle} - Vol.${volumeLabel(volume)}`;
}

/**
 * The details one book is made with. A title typed for a series becomes that volume's title; for a
 * book that is not a volume of a series (a loose CBZ, a folder converted whole, a whole series in
 * one file) it is the book's title as it stands.
 */
export function detailsForBook(details: BookDetails, volume?: number): BookDetails {
  const { title, ...rest } = normalizeBookDetails(details);
  return {
    ...(title === undefined
      ? {}
      : { title: volume === undefined ? title : volumeBookTitle(title, volume) }),
    ...rest,
  };
}
