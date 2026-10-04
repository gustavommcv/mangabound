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
 */
export function planFolderImport<Image extends { readonly name: string }>(
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
  slots.forEach((slot, index) => {
    const image = ordered[index];
    if (image === undefined) return;
    if (chosen.has(slot)) kept.push(slot);
    else assignments.push({ slot, image });
  });
  return {
    assignments,
    kept,
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
