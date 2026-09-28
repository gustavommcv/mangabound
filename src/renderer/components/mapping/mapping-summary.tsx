import type { MappingDraft } from '@/domain/mapping';
import { Button } from '@/renderer/components/ui/button';

export function MappingSummary({
  draft,
  onConfirm,
  onEdit,
}: {
  readonly draft: MappingDraft;
  readonly onConfirm: () => void;
  readonly onEdit: () => void;
}): React.JSX.Element {
  const volumes = [...draft.volumes].sort(
    (left, right) => Number(left.number) - Number(right.number),
  );
  const assignedCount = volumes.reduce((count, volume) => count + volume.chapterIds.length, 0);

  return (
    <section
      aria-labelledby="mapping-summary-title"
      className="border-border bg-surface rounded-xl border p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold" id="mapping-summary-title">
            Proposed chapter mapping
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {String(volumes.length)} volume{volumes.length === 1 ? '' : 's'} ·{' '}
            {String(assignedCount)} of {String(draft.chapters.length)} chapters assigned
          </p>
        </div>
        <Button onClick={onEdit} size="sm" variant="outline">
          Edit chapter mapping
        </Button>
      </div>
      <ol className="border-border mt-4 divide-y border-y">
        {volumes.map((volume) => {
          const chapterNames = draft.chapters
            .filter((chapter) => volume.chapterIds.includes(chapter.id))
            .map((chapter) => chapter.name);
          return (
            <li
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-sm"
              key={volume.id}
            >
              <span className="font-medium">Volume {volume.number}</span>
              <span className="text-muted-foreground min-w-0 truncate text-xs">
                {String(chapterNames.length)} chapter{chapterNames.length === 1 ? '' : 's'}
                {chapterNames.length === 1 && ` · ${chapterNames[0]}`}
                {chapterNames.length > 1 &&
                  ` · first: ${chapterNames[0]} · last: ${chapterNames.at(-1)}`}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">Review this proposal before continuing.</p>
        <Button onClick={onConfirm}>Confirm mapping</Button>
      </div>
    </section>
  );
}
