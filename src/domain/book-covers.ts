/**
 * Which book of an item a cover is for: a volume, by its number, or the one book of an item that
 * makes a single book (a loose CBZ, a folder that is not grouped, a series bound as one).
 */
export type CoverSlot = number | 'book';

/** How a cover came to be there: chosen for that book by hand, or taken from a folder in order. */
export type CoverOrigin = 'chosen' | 'folder';

export interface AttachedCover {
  readonly slot: CoverSlot;
  /** The name the image had where it was picked: shown to the person, never used to find it. */
  readonly name: string;
  readonly origin: CoverOrigin;
}

/** The image types mangapress reads. A cover of another type would stop the book it is for. */
const coverExtensions: ReadonlySet<string> = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']);

export const coverTypesSentence = 'A cover has to be a JPEG, PNG, WebP, GIF or BMP image.';

/** What a person is told when a file with an image's name is not one that can be read. */
export const unreadableCoverSentence = `That file could not be read as an image, so it was not used. ${coverTypesSentence}`;

/** How many bytes at the start of a file say which kind of image it is. */
export const coverHeadLength = 12;

const startsWith = (head: Uint8Array, bytes: readonly number[], offset = 0): boolean =>
  bytes.every((byte, index) => head[offset + index] === byte);

const text = (value: string): readonly number[] =>
  [...value].map((character) => character.charCodeAt(0));

/**
 * Whether a file begins the way a JPEG, PNG, WebP, GIF or BMP image does. mangapress takes the
 * type from what a file holds, not from its name, so this does too: a damaged or mislabelled file
 * would otherwise stop the book it is the cover of, after every one of its pages was made.
 */
export function looksLikeCoverImage(head: Uint8Array): boolean {
  return (
    startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
    startsWith(head, [0xff, 0xd8, 0xff]) ||
    startsWith(head, text('GIF87a')) ||
    startsWith(head, text('GIF89a')) ||
    startsWith(head, text('BM')) ||
    (startsWith(head, text('RIFF')) && startsWith(head, text('WEBP'), 8))
  );
}

export function isCoverImage(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 && coverExtensions.has(fileName.slice(dot + 1).toLowerCase());
}

/** `2.jpg` before `10.jpg`, and no difference between `A` and `a`: the order a person expects. */
const byName = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export interface FolderImportPlan<Image> {
  /** The image each book takes. */
  readonly assignments: readonly { readonly slot: CoverSlot; readonly image: Image }[];
  /** The books that keep the cover chosen for them by hand. */
  readonly kept: readonly CoverSlot[];
  /** The names of the images that fell on a book and could not be read: it keeps its first page. */
  readonly unreadable: readonly string[];
  /** How many images there were, and how many of them lie beyond the last book. */
  readonly images: number;
  readonly unused: number;
  readonly books: number;
}

/**
 * Which image of a folder goes to which book: the first image, in name order, is for the first
 * book, the second for the second, and so on.
 *
 * A cover chosen by hand is never replaced: the image that falls on that book is passed over, and
 * the ones after it still go to the books they line up with. A cover an earlier folder gave is
 * replaced, since a folder is the same kind of answer as the one before it.
 *
 * An image that cannot be read still takes its place in the order, so the images after it keep
 * the books they line up with: its book keeps its first page, and it is said which image it was.
 */
export function planFolderImport<
  Image extends { readonly name: string; readonly readable: boolean },
>(
  slots: readonly CoverSlot[],
  attached: readonly AttachedCover[],
  images: readonly Image[],
): FolderImportPlan<Image> {
  const chosen = new Set(
    attached.filter((cover) => cover.origin === 'chosen').map((cover) => cover.slot),
  );
  const ordered = [...images].sort((left, right) => byName.compare(left.name, right.name));
  const assignments: { slot: CoverSlot; image: Image }[] = [];
  const kept: CoverSlot[] = [];
  const unreadable: string[] = [];
  slots.forEach((slot, index) => {
    const image = ordered[index];
    if (image === undefined) return;
    if (chosen.has(slot)) kept.push(slot);
    else if (image.readable) assignments.push({ slot, image });
    else unreadable.push(image.name);
  });
  return {
    assignments,
    kept,
    unreadable,
    images: ordered.length,
    unused: Math.max(0, ordered.length - slots.length),
    books: slots.length,
  };
}

const count = (amount: number, word: string): string =>
  `${String(amount)} ${word}${amount === 1 ? '' : 's'}`;

/** What a person is told after a folder was taken, when it did not simply fill every book. */
export function describeFolderImport(plan: FolderImportPlan<unknown>): string | undefined {
  if (plan.images === 0) return `No image was found there. ${coverTypesSentence}`;
  const parts: string[] = [];
  if (plan.kept.length > 0) {
    parts.push(
      `${count(plan.kept.length, 'book')} ${plan.kept.length === 1 ? 'keeps' : 'keep'} the cover chosen for ${plan.kept.length === 1 ? 'it' : 'them'}.`,
    );
  }
  if (plan.unreadable.length > 0) {
    const [first, second, third, ...rest] = plan.unreadable;
    const named = [first, second, third].filter((name) => name !== undefined);
    const more = rest.length > 0 ? ` and ${String(rest.length)} more` : '';
    parts.push(
      `${count(plan.unreadable.length, 'image')} could not be read (${named.join(', ')}${more}), so ${plan.unreadable.length === 1 ? 'the book it falls on keeps its first page' : 'the books they fall on keep their first pages'}.`,
    );
  }
  if (plan.unused > 0) {
    parts.push(
      `${count(plan.unused, 'image')} ${plan.unused === 1 ? 'was' : 'were'} not used: there ${plan.books === 1 ? 'is' : 'are'} ${count(plan.books, 'book')}.`,
    );
  } else if (plan.images < plan.books) {
    parts.push(
      `There ${plan.images === 1 ? 'was' : 'were'} ${count(plan.images, 'image')} for ${count(plan.books, 'book')}; the other books are unchanged.`,
    );
  }
  return parts.length === 0 ? undefined : parts.join(' ');
}
