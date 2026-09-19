import {
  Boxes,
  CheckCircle2,
  ChevronRight,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  Upload,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { type QueueRow, summarizeQueue } from '@/domain/input-queue';
import type { BookFormat } from '@/domain/conversion';
import type { MangapressSettings } from '@/domain/output-profile';
import type { ProcessMode } from '@/domain/process-mode';
import { QueueRowItem } from '@/renderer/components/queue/queue-row';
import { ProcessSteps } from '@/renderer/components/settings/process-steps';
import { Button } from '@/renderer/components/ui/button';
import { Label } from '@/renderer/components/ui/label';
import { NativeSelect } from '@/renderer/components/ui/native-select';
import { SegmentedControl } from '@/renderer/components/ui/segmented-control';
import { cn } from '@/renderer/lib/utils';
import type {
  DeviceProfileSummary,
  PlanSummary,
  SelectedLibrary,
} from '@/shared/workflow-contract';

export interface RowPlan {
  readonly name: string;
  readonly plan: PlanSummary;
}

export interface QueueScreenProps {
  /** True until the bundled tools are verified: nothing can be added or run before that. */
  readonly disabled: boolean;
  readonly format: BookFormat;
  readonly library?: SelectedLibrary;
  readonly mode: ProcessMode;
  readonly onAddFiles: () => void;
  readonly onAddFolders: () => void;
  /** Adds a whole library of manga folders; offered until libraries join the queue itself. */
  readonly onAddLibrary?: () => void;
  readonly onChooseLibrary: () => void;
  readonly onClear: () => void;
  readonly onConvert: () => void;
  readonly onDeviceProfile: (code: string) => void;
  readonly onDismissRejected: () => void;
  readonly onDropFiles: (files: readonly File[]) => void;
  readonly onEdit: (id: string) => void;
  readonly onFormat: (format: BookFormat) => void;
  readonly onMode: (mode: ProcessMode) => void;
  readonly onOpenOptions: () => void;
  readonly onRemove: (id: string) => void;
  readonly onValidate: () => void;
  readonly plans?: readonly RowPlan[];
  readonly profiles: readonly DeviceProfileSummary[];
  /** Items the last add could not use, with the reason for each. */
  readonly rejected: readonly { readonly name: string; readonly reason: string }[];
  readonly rows: readonly QueueRow[];
  readonly settings: MangapressSettings;
  readonly validating: boolean;
}

const formatOptions = [
  { value: 'epub', label: 'EPUB' },
  { value: 'cbz', label: 'CBZ' },
  { value: 'pdf', label: 'PDF' },
] as const;

const plural = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? '' : 's'}`;

export function QueueScreen(props: QueueScreenProps): React.JSX.Element {
  const {
    disabled,
    format,
    library,
    mode,
    onAddFiles,
    onAddFolders,
    onAddLibrary,
    onChooseLibrary,
    onClear,
    onConvert,
    onDeviceProfile,
    onDismissRejected,
    onDropFiles,
    onEdit,
    onFormat,
    onMode,
    onOpenOptions,
    onRemove,
    onValidate,
    plans,
    profiles,
    rejected,
    rows,
    settings,
    validating,
  } = props;
  const summary = summarizeQueue(rows, mode);
  const mangapressRuns = mode !== 'bind-only';
  const canRun =
    !disabled && summary.inspecting === 0 && summary.runnable > 0 && library !== undefined;
  const verb = mode === 'bind-only' ? 'Join' : 'Convert';
  const hint =
    summary.inspecting > 0
      ? `Reading ${plural(summary.inspecting, 'item')}…`
      : summary.total === 0
        ? undefined
        : library === undefined
          ? 'Choose an output folder to continue.'
          : summary.runnable === 0
            ? 'Nothing here can run yet.'
            : summary.skipped > 0
              ? `${plural(summary.skipped, 'item')} will be left out. Use the pencil on a row to fix it.`
              : undefined;

  return (
    <section
      aria-labelledby="queue-title"
      className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
    >
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-medium" id="queue-title">
            Queue
          </h1>
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
            {String(rows.length)}
          </span>
          <span className="flex-1" />
          <Button disabled={disabled} onClick={onAddFiles} size="sm" variant="outline">
            <FilePlus2 /> Files
          </Button>
          <Button disabled={disabled} onClick={onAddFolders} size="sm" variant="outline">
            <FolderPlus /> Folder
          </Button>
          {onAddLibrary !== undefined && (
            <Button disabled={disabled} onClick={onAddLibrary} size="sm" variant="ghost">
              <Boxes /> Library
            </Button>
          )}
          {rows.length > 0 && (
            <Button onClick={onClear} size="sm" variant="ghost">
              Clear
            </Button>
          )}
        </div>

        <DropTarget disabled={disabled} onDropFiles={onDropFiles} empty={rows.length === 0}>
          {rows.length > 0 && (
            <ul aria-label="Queued items" className="space-y-0.5">
              {rows.map((row) => (
                <QueueRowItem
                  key={row.id}
                  mode={mode}
                  onEdit={() => {
                    onEdit(row.id);
                  }}
                  onRemove={() => {
                    onRemove(row.id);
                  }}
                  row={row}
                />
              ))}
            </ul>
          )}
        </DropTarget>

        {rejected.length > 0 && (
          <div
            className="border-status-warning/40 bg-status-warning/10 flex items-start gap-3 rounded-lg border px-4 py-3"
            role="status"
          >
            <ul className="min-w-0 flex-1 space-y-1 text-xs">
              {rejected.map((item, index) => (
                <li key={`${item.name}-${String(index)}`}>
                  <span className="font-medium">{item.name}</span> was not added. {item.reason}
                </li>
              ))}
            </ul>
            <Button
              aria-label="Dismiss this message"
              onClick={onDismissRejected}
              size="icon"
              variant="ghost"
            >
              <X />
            </Button>
          </div>
        )}

        {plans !== undefined && plans.length > 0 && <PlansPanel plans={plans} />}
      </div>

      <aside
        aria-label="Conversion options"
        className="border-border bg-surface h-fit space-y-5 rounded-xl border p-5"
      >
        <ProcessSteps
          input={rows.length > 0 && rows.every((row) => row.kind === 'cbz') ? 'cbz' : 'folder'}
          mode={mode}
          onMode={onMode}
        />

        <div className="space-y-1.5">
          <Label htmlFor="queue-device">Device</Label>
          <NativeSelect
            disabled={!mangapressRuns || profiles.length === 0}
            id="queue-device"
            onChange={(event) => {
              onDeviceProfile(event.target.value);
            }}
            value={settings.deviceProfile}
          >
            {profiles.map((profile) => (
              <option key={profile.code} value={profile.code}>
                {profile.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm leading-none font-medium">Format</p>
          <SegmentedControl
            disabled={!mangapressRuns}
            label="Format"
            onChange={onFormat}
            options={formatOptions}
            value={format}
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-sm leading-none font-medium">Save to</p>
          <div className="bg-muted flex items-center justify-between gap-2 rounded-lg py-1 pr-1 pl-3">
            <p className="min-w-0 text-sm break-all">
              {library?.displayPath ?? 'No folder selected'}
            </p>
            <Button
              aria-label={library === undefined ? 'Choose output folder' : 'Change output folder'}
              onClick={onChooseLibrary}
              size="sm"
              variant="outline"
            >
              <FolderOpen /> {library === undefined ? 'Choose' : 'Change'}
            </Button>
          </div>
        </div>

        {mangapressRuns && (
          <button
            className="border-border hover:text-foreground focus-visible:ring-ring text-muted-foreground flex w-full items-center justify-between border-t py-2.5 text-sm outline-none focus-visible:ring-2"
            onClick={onOpenOptions}
            type="button"
          >
            mangapress options
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        )}

        <div className="space-y-2">
          <Button className="w-full" disabled={!canRun} onClick={onConvert} size="lg">
            {summary.runnable === 0 ? verb : `${verb} ${plural(summary.runnable, 'item')}`}
          </Button>
          <Button
            className="w-full"
            disabled={!canRun || validating}
            onClick={onValidate}
            variant="ghost"
          >
            {validating ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <CheckCircle2 />
            )}
            {validating ? 'Validating…' : 'Validate plan'}
          </Button>
          {hint !== undefined && (
            <p aria-live="polite" className="text-muted-foreground text-xs">
              {hint}
            </p>
          )}
        </div>
      </aside>
    </section>
  );
}

/**
 * The area files and folders can be dropped on. Anywhere on the window would do to receive a drop,
 * but a visible target is what tells the user that dropping works at all.
 */
function DropTarget({
  children,
  disabled,
  empty,
  onDropFiles,
}: {
  readonly children: React.ReactNode;
  readonly disabled: boolean;
  readonly empty: boolean;
  readonly onDropFiles: (files: readonly File[]) => void;
}): React.JSX.Element {
  // A counter, not a flag: dragging across the target's children fires enter and leave repeatedly.
  const [depth, setDepth] = useState(0);
  const over = depth > 0;
  return (
    <div
      className={cn(
        'rounded-xl border border-dashed transition-colors',
        over ? 'border-accent bg-accent/10' : 'border-border',
        empty ? 'flex min-h-72 flex-col items-center justify-center p-8' : 'p-2',
      )}
      data-testid="drop-target"
      onDragEnter={(event) => {
        if (disabled || !event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDepth((current) => current + 1);
      }}
      onDragLeave={() => {
        setDepth((current) => Math.max(0, current - 1));
      }}
      onDragOver={(event) => {
        if (disabled || !event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDepth(0);
        const files = Array.from(event.dataTransfer.files);
        if (!disabled && files.length > 0) onDropFiles(files);
      }}
    >
      {children}
      <p
        className={cn(
          'text-subtle-foreground flex items-center justify-center gap-2 text-sm',
          empty ? 'text-center' : 'mt-2 p-3',
        )}
      >
        <Upload aria-hidden="true" className="size-4 shrink-0" />
        {over
          ? 'Release to add them'
          : empty
            ? 'Drop manga folders or .cbz files here, or use Files and Folder.'
            : 'Drop files or folders here'}
      </p>
    </div>
  );
}

function PlansPanel({ plans }: { readonly plans: readonly RowPlan[] }): React.JSX.Element {
  return (
    <section
      aria-labelledby="plans-title"
      className="border-accent/30 bg-accent/5 space-y-4 rounded-xl border p-5"
    >
      <div className="flex items-center gap-2">
        <CheckCircle2 aria-hidden="true" className="text-accent size-5" />
        <h2 className="font-semibold" id="plans-title">
          Plan validated
        </h2>
      </div>
      <p className="text-muted-foreground text-xs">No library files were written.</p>
      {plans.map(({ name, plan }) => (
        <div key={name}>
          <h3 className="text-sm font-medium">{name}</h3>
          <p className="text-muted-foreground mt-1 text-xs">{plan.message}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {plan.books.map((book) => (
              <li className="flex justify-between gap-4" key={book.name}>
                <span className="truncate">{book.name}</span>
                <span className="text-muted-foreground shrink-0">
                  {plural(book.pageCount, 'page')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
