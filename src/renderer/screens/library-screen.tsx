import { ChevronLeft, Folder, Layers, UserPen } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { hasBookDetails } from '@/domain/book-details';
import { isPendingTitle, isWaitingTitle, type LibraryTitle } from '@/domain/input-queue';
import { skippedLinksNotice } from '@/domain/library-links';
import { unassignedChapterCount } from '@/domain/input-queue';
import { Button } from '@/renderer/components/ui/button';
import { InfoBanner } from '@/renderer/components/shared/info-banner';
import { cn } from '@/renderer/lib/utils';

export interface LibraryScreenProps {
  readonly name: string;
  readonly onBack: () => void;
  readonly onEdit: (title: string) => void;
  /** Absent when the run does not make books with mangapress, so there is nothing to edit. */
  readonly onEditDetails?: (title: string) => void;
  readonly singleBook?: boolean;
  /** Links in the library folder that were not followed: series that are not in the list. */
  readonly skippedLinks?: readonly string[];
  readonly titles: readonly LibraryTitle[];
}

const plural = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? '' : 's'}`;

/** The manga a library holds, and which of them still need their volumes grouped. */
export function LibraryScreen({
  name,
  onBack,
  onEdit,
  onEditDetails,
  singleBook,
  skippedLinks = [],
  titles,
}: LibraryScreenProps): React.JSX.Element {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  return (
    <section aria-labelledby="library-title" className="mx-auto max-w-3xl space-y-5">
      <Button onClick={onBack} variant="ghost">
        <ChevronLeft /> Queue
      </Button>
      <div>
        <h1
          className="focus-visible:ring-ring focus-visible:ring-offset-background rounded-md text-2xl font-semibold tracking-tight break-all outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          id="library-title"
          ref={titleRef}
          tabIndex={-1}
        >
          {name}
        </h1>
        <p className="text-subtle-foreground mt-1 text-sm">
          {plural(titles.length, 'title')}. A title with no volumes is left out of a run until you
          group it.
        </p>
        {skippedLinks.length > 0 && <SkippedLinks names={skippedLinks} />}
        {singleBook && (
          <InfoBanner
            className="mt-3"
            message="Each title in the library will be produced as its own single-series EPUB."
            title="Single book mode"
          />
        )}
      </div>
      <ul aria-label="Titles" className="space-y-0.5">
        {titles.map((title) => (
          <TitleRow
            key={title.title}
            onEdit={onEdit}
            {...(onEditDetails === undefined ? {} : { onEditDetails })}
            title={title}
          />
        ))}
      </ul>
    </section>
  );
}

/** Series kept as links are not in the list below, and nothing else says so. */
function SkippedLinks({ names }: { readonly names: readonly string[] }): React.JSX.Element {
  const notice = skippedLinksNotice(names);
  return (
    <InfoBanner
      className="mt-3"
      message={
        <>
          {notice.advice} <strong className="text-foreground">{notice.names}</strong>.
        </>
      }
      title={notice.title}
    />
  );
}

function TitleRow({
  onEdit,
  onEditDetails,
  title,
}: {
  readonly onEdit: (title: string) => void;
  readonly onEditDetails?: (title: string) => void;
  readonly title: LibraryTitle;
}): React.JSX.Element {
  const saved = title.outcome?.status === 'done';
  const failed = title.outcome?.status === 'failed';
  const unassigned = unassignedChapterCount(title.draft);
  const chip = saved
    ? { label: 'Saved', tone: 'bg-muted text-muted-foreground' }
    : failed
      ? { label: 'Failed', tone: 'bg-status-failed/15 text-status-failed' }
      : isWaitingTitle(title)
        ? { label: 'Needs volumes', tone: 'bg-status-warning/15 text-status-warning' }
        : {
            label: plural(title.volumes.length, 'volume'),
            tone: 'bg-accent/15 text-accent',
          };
  return (
    <li className="hover:bg-muted/40 flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors">
      <span
        aria-hidden="true"
        className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg"
      >
        <Folder className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title.title}</p>
        <p className="text-subtle-foreground truncate text-xs">
          {plural(title.draft.chapters.length, 'chapter')}
          {unassigned > 0 && isPendingTitle(title)
            ? ` · ${plural(unassigned, 'chapter')} left out`
            : ''}
        </p>
        {title.outcome?.status === 'failed' && (
          <p className="text-muted-foreground mt-0.5 text-xs">{title.outcome.message}</p>
        )}
      </div>
      <span
        className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs whitespace-nowrap', chip.tone)}
      >
        {chip.label}
      </span>
      {saved ? (
        // Keeps the status chips of every title in one column.
        <span aria-hidden="true" className="size-9 shrink-0" />
      ) : (
        <>
          <Button
            aria-label={`Edit volumes for ${title.title}`}
            onClick={() => {
              onEdit(title.title);
            }}
            size="icon"
            title="Edit volumes"
            variant="ghost"
          >
            <Layers />
          </Button>
          {onEditDetails !== undefined && (
            <Button
              aria-label={`Edit details of ${title.title}`}
              className={cn(hasBookDetails(title.details) && 'text-accent')}
              onClick={() => {
                onEditDetails(title.title);
              }}
              size="icon"
              title={
                hasBookDetails(title.details)
                  ? 'Edit title, author and language (set)'
                  : 'Edit title, author and language'
              }
              variant="ghost"
            >
              <UserPen />
            </Button>
          )}
        </>
      )}
    </li>
  );
}
