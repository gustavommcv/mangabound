import { FileArchive, Folder, Library, LoaderCircle, Pencil, X } from 'lucide-react';

import { describeRow, type QueueRow, type RowTone } from '@/domain/input-queue';
import type { ProcessMode } from '@/domain/process-mode';
import { Button } from '@/renderer/components/ui/button';
import { cn } from '@/renderer/lib/utils';

const chipTone: Record<RowTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  accent: 'bg-accent/15 text-accent',
  warning: 'bg-status-warning/15 text-status-warning',
  danger: 'bg-status-failed/15 text-status-failed',
};

/** One item in the queue: what it is, whether a run will process it, and how to change that. */
export function QueueRowItem({
  mode,
  onEdit,
  onRemove,
  row,
}: {
  readonly mode: ProcessMode;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
  readonly row: QueueRow;
}): React.JSX.Element {
  const view = describeRow(row, mode);
  const Icon = row.kind === 'folder' ? Folder : row.kind === 'library' ? Library : FileArchive;
  // A folder or a library has volumes to edit, and only while volumes are in play.
  const editable = row.state === 'inspected' && row.kind !== 'cbz' && mode !== 'convert-only';
  return (
    <li className="hover:bg-muted/40 flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors">
      <span
        aria-hidden="true"
        className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg"
      >
        {row.state === 'inspecting' ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Icon className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={row.displayPath}>
          {row.displayName}
        </p>
        <p className="text-subtle-foreground truncate text-xs">{view.detail}</p>
        {view.note !== undefined && (
          <p className="text-muted-foreground mt-0.5 text-xs">{view.note}</p>
        )}
      </div>
      <span
        className={cn(
          'shrink-0 rounded-full px-2.5 py-0.5 text-xs whitespace-nowrap',
          chipTone[view.tone],
        )}
      >
        {view.chip}
      </span>
      {editable && (
        <Button
          aria-label={
            row.kind === 'library'
              ? `Edit titles of ${row.displayName}`
              : `Edit volumes for ${row.displayName}`
          }
          onClick={onEdit}
          size="icon"
          variant="ghost"
        >
          <Pencil />
        </Button>
      )}
      <Button
        aria-label={`Remove ${row.displayName}`}
        onClick={onRemove}
        size="icon"
        variant="ghost"
      >
        <X />
      </Button>
    </li>
  );
}
