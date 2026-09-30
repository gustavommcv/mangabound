/**
 * What names one book, or one series of them: a person types it for the item in hand rather than
 * keeping it as a preference (ADR 0030). Every field is optional, and a field left out means the
 * default: the title the tools derive from the input's name, no author, the language chosen in the
 * options.
 */
export interface BookDetails {
  readonly title?: string;
  readonly author?: string;
  /** A language tag such as "en-US" or "pt-br". */
  readonly language?: string;
}

export const noBookDetails: BookDetails = Object.freeze({});

/** The most a title or an author may hold; the same limit the command contract enforces. */
export const maxDetailLength = 300;

/** A language tag such as "en" or "pt-br": letters and digits in short groups joined by dashes. */
export const languageTagPattern = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/iu;
export const maxLanguageLength = 20;

export function isLanguageTag(value: string): boolean {
  return value.length <= maxLanguageLength && languageTagPattern.test(value);
}

const trimmed = (value: string | undefined): string | undefined => {
  const text = value?.trim();
  return text === undefined || text === '' ? undefined : text;
};

/** The details as they are kept: text trimmed, and a field left blank taken as not set. */
export function normalizeBookDetails(details: BookDetails): BookDetails {
  const title = trimmed(details.title);
  const author = trimmed(details.author);
  const language = trimmed(details.language);
  return {
    ...(title === undefined ? {} : { title }),
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
