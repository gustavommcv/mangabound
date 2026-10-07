import { FolderOpen, X } from 'lucide-react';

import type { AttachedCover, CoverSlot } from '@/domain/book-covers';
import { Button } from '@/renderer/components/ui/button';

/** What the covers of an item can be told to do; the item itself is the page's. */
export interface BookCoverControls {
  readonly attached: readonly AttachedCover[];
  /** What the last change left to say: images that were not used, covers that were kept. */
  readonly note?: string;
  readonly onChoose: (slot: CoverSlot) => void;
  readonly onRemove: (slot: CoverSlot) => void;
  readonly onChooseFolder: () => void;
  /** Files dropped on one book, or on the list when no book is named. */
  readonly onDropFiles: (slot: CoverSlot | undefined, files: readonly File[]) => void;
}

interface BookCoversProps extends BookCoverControls {
  /** The books the item makes, in order. Empty while a series has no volumes yet. */
  readonly books: readonly { readonly slot: CoverSlot; readonly title: string }[];
  /** Why covers have no effect right now, when they have none. */
  readonly unavailable?: string;
}

const carriesFiles = (event: React.DragEvent): boolean =>
  event.dataTransfer.types.includes('Files');

/**
 * A cover of the person's own for each book of an item (ADR 0040): chosen or dropped for one
 * book, or taken from a folder in order. A book without one keeps its first page.
 */
export function BookCovers({
  attached,
  books,
  note,
  onChoose,
  onChooseFolder,
  onDropFiles,
  onRemove,
  unavailable,
}: BookCoversProps): React.JSX.Element {
  const coverOf = (slot: CoverSlot): AttachedCover | undefined =>
    attached.find((cover) => cover.slot === slot);
  const dropOn = (slot: CoverSlot | undefined) => (event: React.DragEvent) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    // A drop on a book is that book's alone; the list around it must not take it again.
    event.stopPropagation();
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onDropFiles(slot, files);
  };
  const allowDrop = (event: React.DragEvent): void => {
    if (carriesFiles(event)) event.preventDefault();
  };

  return (
    <section
      aria-labelledby="book-covers-title"
      className="border-border bg-surface space-y-4 rounded-xl border p-6"
      onDragOver={allowDrop}
      onDrop={dropOn(undefined)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-56 flex-1">
          <h2 className="text-lg font-semibold" id="book-covers-title">
            Covers
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {unavailable ??
              'A book without a cover of its own uses its first page. Drop an image on a book, or a folder on the list.'}
          </p>
        </div>
        {books.length > 0 && (
          <Button onClick={onChooseFolder} variant="outline">
            <FolderOpen /> Add covers from a folder…
          </Button>
        )}
      </div>
      {books.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Once the volumes are set, each one can take a cover.
        </p>
      ) : (
        <ul aria-label="Books and their covers">
          {books.map((book) => {
            const cover = coverOf(book.slot);
            return (
              <li
                className="border-border flex items-center gap-3 border-t py-2.5 first:border-t-0"
                key={String(book.slot)}
                onDragOver={allowDrop}
                onDrop={dropOn(book.slot)}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{book.title}</p>
                  <p className="text-subtle-foreground truncate text-xs">
                    {cover === undefined
                      ? 'First page'
                      : cover.origin === 'folder'
                        ? `${cover.name} · from a folder`
                        : cover.name}
                  </p>
                </div>
                <Button
                  aria-label={`${cover === undefined ? 'Choose a cover for' : 'Change the cover of'} ${book.title}`}
                  onClick={() => {
                    onChoose(book.slot);
                  }}
                  size="sm"
                  variant="outline"
                >
                  {cover === undefined ? 'Choose cover…' : 'Change…'}
                </Button>
                {cover !== undefined && (
                  <Button
                    aria-label={`Remove the cover of ${book.title}`}
                    onClick={() => {
                      onRemove(book.slot);
                    }}
                    size="icon"
                    variant="outline"
                  >
                    <X />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {note !== undefined && (
        <p className="text-muted-foreground text-xs" role="status">
          {note}
        </p>
      )}
    </section>
  );
}
