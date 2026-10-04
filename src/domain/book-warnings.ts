import type { BookWarning } from './conversion';

/** One kind of warning as the results show it: what it is, what to do, and which books it is in. */
export interface WarningNotice {
  readonly code: string;
  readonly title: string;
  readonly message: string;
  /** Which books it is about; absent when the run made a single book. */
  readonly where?: string;
}

interface BookWithWarnings {
  readonly name: string;
  readonly warnings?: readonly BookWarning[];
}

/**
 * What the app says for each warning mangapress 0.7 gives. The tool's own sentences are written
 * for a terminal (the one about small pages names `--upscale`), so a known code gets words that
 * name the option as the screen does; the protocol asks consumers to branch on the code anyway.
 */
const knownWarnings: Readonly<Record<string, Pick<WarningNotice, 'title' | 'message'>>> = {
  images_smaller_than_device: {
    title: 'Pages smaller than the screen',
    message:
      'More than a quarter of the pages are smaller than the screen and nothing enlarges them. Choose “Fit, enlarging small pages” under Page size to make them easier to read.',
  },
  source_already_converted: {
    title: 'Pages already converted once',
    message:
      'These pages look like Kindle Comic Converter already converted them; converting again lowers their quality. Use the original files if you have them.',
  },
  skipped_non_images: {
    title: 'Files that are not images were left out',
    message: 'The input holds files that are not page images. They are not in the book.',
  },
  spread_labels_ignored: {
    title: 'A .json file beside the book was not used',
    message: 'It is not a list of spread labels, so the book was made without it.',
  },
  spread_labels_skipped: {
    title: 'Some labelled spreads were not joined',
    message: 'A labelled position had no page to be joined with. The other spreads were joined.',
  },
  output_collision: {
    title: 'Saved under another name',
    message: 'The book would have replaced its own source, so it was given another name.',
  },
};

/** For a code a later mangapress adds: its own sentence, under a heading that says whose it is. */
const unknownWarningTitle = 'A note from mangapress';

/**
 * What the app says for a code, or `undefined` for one it does not know. A code is known only if
 * the table has it as its own entry: `constructor` and `toString` are not codes, and must not find
 * the methods every object has.
 */
function knownWarning(code: string): Pick<WarningNotice, 'title' | 'message'> | undefined {
  return Object.hasOwn(knownWarnings, code) ? knownWarnings[code] : undefined;
}

/**
 * The warnings of a run, one notice per kind in the order they first came, each saying which
 * books it is about. Twenty volumes with the same warning are one notice, not twenty.
 *
 * A code the app does not know is grouped with its sentence, so two different sentences under
 * one unknown code stay two notices.
 */
export function warningNotices(books: readonly BookWithWarnings[]): readonly WarningNotice[] {
  const groups = new Map<
    string,
    { readonly code: string; readonly message: string; names: string[] }
  >();
  for (const book of books) {
    for (const warning of book.warnings ?? []) {
      const key =
        knownWarning(warning.code) === undefined
          ? `${warning.code}\n${warning.message}`
          : warning.code;
      const group = groups.get(key) ?? { code: warning.code, message: warning.message, names: [] };
      if (!group.names.includes(book.name)) group.names.push(book.name);
      groups.set(key, group);
    }
  }
  return [...groups.values()].map(({ code, message, names }) => {
    const text = knownWarning(code) ?? { title: unknownWarningTitle, message };
    const where = whichBooks(names, books.length);
    return { code, ...text, ...(where === undefined ? {} : { where }) };
  });
}

function whichBooks(names: readonly string[], total: number): string | undefined {
  if (total === 1) return undefined;
  if (names.length === total) return `In all ${String(total)} books.`;
  const [first, second, ...rest] = names;
  if (second === undefined) return `In ${String(first)}.`;
  if (rest.length === 0) return `In ${String(first)} and ${second}.`;
  return `In ${String(first)}, ${second} and ${String(rest.length)} more.`;
}
