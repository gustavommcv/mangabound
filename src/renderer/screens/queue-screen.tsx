import {
  CheckCircle2,
  ChevronRight,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  X,
} from 'lucide-react';
import { useEffect, useRef } from 'react';

import { type QueueRow, summarizeQueue } from '@/domain/input-queue';
import type { BookFormat } from '@/domain/conversion';
import type { MangapressSettings } from '@/domain/output-profile';
import { isDefaultMangapress } from '@/domain/preferences';
import { defaultProcessMode, type ProcessMode } from '@/domain/process-mode';
import { DropTarget } from '@/renderer/components/queue/drop-target';
import { QueueRowItem } from '@/renderer/components/queue/queue-row';
import { ProcessSteps } from '@/renderer/components/settings/process-steps';
import { ResetOptions } from '@/renderer/components/settings/reset-options';
import { Button } from '@/renderer/components/ui/button';
import { Label } from '@/renderer/components/ui/label';
import { NativeSelect } from '@/renderer/components/ui/native-select';
import { SegmentedControl } from '@/renderer/components/ui/segmented-control';
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
  /** Puts the steps, device, format and every mangapress option back to their defaults. */
  readonly onReset: () => void;
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

/** A queue of one kind only limits the steps to what that kind allows; a mixed one does not. */
function stepsInput(rows: readonly QueueRow[]): 'folder' | 'cbz' | 'library' {
  const kind = rows[0]?.kind;
  return kind !== undefined && rows.every((row) => row.kind === kind) && kind !== 'folder'
    ? kind
    : 'folder';
}

export function QueueScreen(props: QueueScreenProps): React.JSX.Element {
  const {
    disabled,
    format,
    library,
    mode,
    onAddFiles,
    onAddFolders,
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
    onReset,
    onValidate,
    plans,
    profiles,
    rejected,
    rows,
    settings,
    validating,
  } = props;
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
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
          <h1
            className="focus-visible:ring-ring focus-visible:ring-offset-background rounded-md text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            id="queue-title"
            ref={titleRef}
            tabIndex={-1}
          >
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
          {rows.length > 0 && (
            <Button onClick={onClear} size="sm" variant="ghost">
              Clear
            </Button>
          )}
        </div>

        <DropTarget
          disabled={disabled}
          empty={rows.length === 0}
          onAddFiles={onAddFiles}
          onAddFolders={onAddFolders}
          onDropFiles={onDropFiles}
        >
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
        <ProcessSteps input={stepsInput(rows)} mode={mode} onMode={onMode} />

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

        <div className="border-border border-t pt-3">
          <ResetOptions
            changed={mode !== defaultProcessMode || !isDefaultMangapress(format, settings)}
            onReset={onReset}
            scope="the steps, device, format and every mangapress option"
          />
        </div>

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
