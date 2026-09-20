import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  GitMerge,
  Plus,
  Redo2,
  RotateCcw,
  Scissors,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import {
  createMappingHistory,
  dispatchMappingCommand,
  redoMappingCommand,
  type MappingCommand,
  type MappingEditorHistory,
  undoMappingCommand,
} from '@/domain/mapping-editor';
import {
  assignedVolumeId,
  dominantLanguage,
  type MappingDraft,
  MappingOperationError,
  mappingSignature,
  serializeMangabindMetadata,
  type VolumeSuggestion,
  validateMapping,
} from '@/domain/mapping';
import { ChaptersFrom } from './chapters-from';

import { Button } from '@/renderer/components/ui/button';
import { Checkbox } from '@/renderer/components/ui/checkbox';
import { Input } from '@/renderer/components/ui/input';
import { Label } from '@/renderer/components/ui/label';
import { NativeSelect } from '@/renderer/components/ui/native-select';
import type { MetadataProviderDescriptor, MetadataSearchResult } from '@/shared/workflow-contract';

export interface MappingEditorProps {
  readonly initialDraft: MappingDraft;
  /** Set when `initialDraft` already carries mangabind's own grouping (volumes read from names). */
  readonly startedFrom?: 'mangabind' | undefined;
  readonly onConfirm?: (metadata: string, draft: MappingDraft) => void;
  /** Offered when the folder can skip grouping and go straight to mangapress as one book. */
  readonly onSkipGrouping?: () => void;
  /** Online sources that can suggest volumes. The "Online source" tab only appears when there is one. */
  readonly metadataProviders?: readonly MetadataProviderDescriptor[];
  /** The source chosen, if any. Left out, the editor keeps the choice itself. */
  readonly selectedProviderId?: string | undefined;
  readonly onSelectProvider?: (providerId: string | undefined) => void;
  readonly onOpenProviderHomepage?: (providerId: string) => void;
  readonly onSearchMetadata?: (
    providerId: string,
    title: string,
    signal: AbortSignal,
  ) => Promise<readonly MetadataSearchResult[]>;
  readonly onSuggestVolumes?: (
    providerId: string,
    workId: string,
    /** The language the folders declare, so the volumes are those of that translation. */
    language?: string,
  ) => Promise<{ readonly volumes: readonly VolumeSuggestion[] }>;
}

function nextVolumeNumber(draft: MappingDraft): string {
  const greatest = draft.volumes.reduce(
    (current, volume) => Math.max(current, Number(volume.number)),
    0,
  );
  return String(Math.floor(greatest) + 1);
}

function mappingOriginLabel(
  draft: MappingDraft,
  initialDraft: MappingDraft,
  startedFrom: MappingEditorProps['startedFrom'],
  providers: readonly MetadataProviderDescriptor[],
): string {
  if (draft.source !== undefined) {
    // The mapping records the source's id; the person is told its name.
    const named = providers.find((provider) => provider.id === draft.source?.provider);
    return `Suggested by ${named?.displayName ?? draft.source.provider}`;
  }
  // Only claim mangabind's grouping while the draft still says exactly what mangabind proposed.
  if (startedFrom === 'mangabind' && mappingSignature(draft) === mappingSignature(initialDraft)) {
    return 'Grouped by mangabind · Offline';
  }
  return 'Manual mapping · Offline';
}

function volumeName(draft: MappingDraft, volumeId: string | undefined): string {
  if (volumeId === undefined) return 'Unassigned';
  const volume = draft.volumes.find((candidate) => candidate.id === volumeId);
  return volume === undefined ? 'Unassigned' : `Volume ${volume.number}`;
}

export function MappingEditor({
  initialDraft,
  startedFrom,
  onConfirm,
  metadataProviders = [],
  onOpenProviderHomepage,
  onSelectProvider,
  onSkipGrouping,
  onSearchMetadata,
  onSuggestVolumes,
  selectedProviderId,
}: MappingEditorProps): React.JSX.Element {
  const [history, setHistory] = useState<MappingEditorHistory>(() =>
    createMappingHistory(initialDraft),
  );
  const [selectedChapterIds, setSelectedChapterIds] = useState<ReadonlySet<string>>(new Set());
  const [newVolumeNumber, setNewVolumeNumber] = useState(() => nextVolumeNumber(initialDraft));
  const [targetVolumeId, setTargetVolumeId] = useState(initialDraft.volumes[0]?.id ?? '');
  const [rangeStart, setRangeStart] = useState(initialDraft.chapters[0]?.id ?? '');
  const [rangeEnd, setRangeEnd] = useState(initialDraft.chapters.at(-1)?.id ?? '');
  const [operationMessage, setOperationMessage] = useState<string>();
  // The source is chosen by the caller when it keeps the choice across titles, or here when not.
  const [localProviderId, setLocalProviderId] = useState<string>();
  const generatedId = useRef(0);
  const draft = history.present;
  const effectiveTargetVolumeId = draft.volumes.some((volume) => volume.id === targetVolumeId)
    ? targetVolumeId
    : (draft.volumes[0]?.id ?? '');
  const issues = useMemo(() => validateMapping(draft), [draft]);
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  const createVolumeId = (): string => {
    let id: string;
    do {
      generatedId.current += 1;
      id = `volume-created-${String(generatedId.current)}`;
    } while (draft.volumes.some((volume) => volume.id === id));
    return id;
  };

  const dispatch = (command: MappingCommand): boolean => {
    try {
      const next = dispatchMappingCommand(history, command);
      setHistory(next);
      setOperationMessage(undefined);
      return true;
    } catch (error) {
      setOperationMessage(
        error instanceof MappingOperationError
          ? error.message
          : 'That edit could not be applied. Nothing was changed.',
      );
      return false;
    }
  };

  const addNewVolume = (): void => {
    const id = createVolumeId();
    if (dispatch({ type: 'add-volume', id, number: newVolumeNumber })) {
      const number = String(Math.floor(Number(newVolumeNumber)) + 1);
      setNewVolumeNumber(number);
      setTargetVolumeId(id);
    }
  };

  const toggleChapter = (chapterId: string, checked: boolean): void => {
    setSelectedChapterIds((current) => {
      const next = new Set(current);
      if (checked) next.add(chapterId);
      else next.delete(chapterId);
      return next;
    });
  };

  const assignSelected = (): void => {
    if (
      dispatch({
        type: 'assign-chapters',
        volumeId: effectiveTargetVolumeId,
        chapterIds: [...selectedChapterIds],
      })
    ) {
      setSelectedChapterIds(new Set());
    }
  };

  const unassignSelected = (): void => {
    if (dispatch({ type: 'unassign-chapters', chapterIds: [...selectedChapterIds] })) {
      setSelectedChapterIds(new Set());
    }
  };

  const confirm = (): void => {
    try {
      onConfirm?.(serializeMangabindMetadata(draft), draft);
      setOperationMessage('Mapping confirmed.');
    } catch (error) {
      setOperationMessage(
        error instanceof Error ? error.message : 'The mapping could not be saved.',
      );
    }
  };

  return (
    <section aria-labelledby="mapping-title" className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-muted-foreground text-xs font-medium">Chapter mapping</p>
            <span className="border-border bg-muted text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
              {mappingOriginLabel(draft, initialDraft, startedFrom, metadataProviders)}
            </span>
          </div>
          <h1 id="mapping-title" className="text-2xl font-semibold tracking-tight">
            Organize {draft.mangaTitle || 'untitled manga'} into volumes
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-6">
            Select chapters, assign them to a volume, and fix any conflicts before continuing.
            Assigning an already placed chapter moves it.
          </p>
        </div>
        {onSkipGrouping !== undefined && (
          <div className="space-y-1">
            <Button
              aria-describedby="skip-grouping-detail"
              onClick={onSkipGrouping}
              variant="outline"
            >
              Skip grouping
            </Button>
            <p className="text-muted-foreground max-w-56 text-xs" id="skip-grouping-detail">
              Send the folder to mangapress as one book, without grouping chapters into volumes.
            </p>
          </div>
        )}
        <div className="flex items-center gap-1" aria-label="Edit history" role="group">
          <Button
            aria-label="Undo last mapping edit"
            disabled={history.past.length === 0}
            onClick={() => {
              setHistory(undoMappingCommand(history));
            }}
            size="icon"
            variant="ghost"
          >
            <Undo2 />
          </Button>
          <Button
            aria-label="Redo last mapping edit"
            disabled={history.future.length === 0}
            onClick={() => {
              setHistory(redoMappingCommand(history));
            }}
            size="icon"
            variant="ghost"
          >
            <Redo2 />
          </Button>
          <Button
            aria-label="Reset all mapping edits"
            disabled={history.past.length === 0}
            onClick={() => {
              setHistory(createMappingHistory(initialDraft));
              setSelectedChapterIds(new Set());
              setOperationMessage(undefined);
            }}
            size="icon"
            variant="ghost"
          >
            <RotateCcw />
          </Button>
        </div>
      </header>

      <ChaptersFrom
        names={{
          volumes: initialDraft.volumes.length,
          chapters: initialDraft.chapters.length,
          changed: history.past.length > 0,
          onStartOver: () => {
            setHistory(createMappingHistory(initialDraft));
            setSelectedChapterIds(new Set());
            setOperationMessage(undefined);
          },
        }}
        online={
          metadataProviders.length > 0 &&
          onSearchMetadata !== undefined &&
          onSuggestVolumes !== undefined
            ? {
                providers: metadataProviders,
                selectedId: onSelectProvider === undefined ? localProviderId : selectedProviderId,
                onSelect: onSelectProvider ?? setLocalProviderId,
                onOpenHomepage: onOpenProviderHomepage ?? (() => undefined),
                mangaTitle: draft.mangaTitle,
                language: dominantLanguage(draft.chapters),
                onSearch: onSearchMetadata,
                onSuggest: onSuggestVolumes,
                onApply: (result, volumes) => {
                  dispatch({
                    type: 'apply-suggestion',
                    suggestions: volumes.map((volume) => ({ ...volume, id: createVolumeId() })),
                    source: { provider: result.provider, id: result.id },
                  });
                },
              }
            : undefined
        }
      />

      {operationMessage !== undefined && (
        <div
          aria-live="polite"
          className="border-border bg-muted flex items-start gap-3 rounded-lg border px-4 py-3 text-sm"
          role="status"
        >
          <AlertTriangle
            aria-hidden="true"
            className="text-status-warning mt-0.5 size-4 shrink-0"
          />
          <span>{operationMessage}</span>
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,1fr)]">
        <section
          aria-labelledby="chapters-title"
          className="border-border bg-surface overflow-hidden rounded-xl border"
        >
          <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <h2 id="chapters-title" className="text-sm font-semibold">
                Chapters
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                {String(selectedChapterIds.size)} of {String(draft.chapters.length)} selected
              </p>
            </div>
            <Button
              onClick={() => {
                setSelectedChapterIds(
                  selectedChapterIds.size === draft.chapters.length
                    ? new Set()
                    : new Set(draft.chapters.map((chapter) => chapter.id)),
                );
              }}
              size="sm"
              variant="ghost"
            >
              {selectedChapterIds.size === draft.chapters.length ? 'Clear all' : 'Select all'}
            </Button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {draft.chapters.map((chapter) => {
              const volumeId = assignedVolumeId(draft, chapter.id);
              return (
                <div
                  className="border-border hover:bg-muted/50 flex items-center gap-3 border-b px-5 py-3 last:border-b-0"
                  key={chapter.id}
                >
                  <Checkbox
                    aria-label={`Select ${chapter.name}`}
                    checked={selectedChapterIds.has(chapter.id)}
                    id={`chapter-${chapter.id}`}
                    onCheckedChange={(checked) => {
                      toggleChapter(chapter.id, checked === true);
                    }}
                  />
                  <Label
                    className="min-w-0 flex-1 cursor-pointer"
                    htmlFor={`chapter-${chapter.id}`}
                  >
                    <span className="block truncate">{chapter.name}</span>
                    <span className="text-subtle-foreground mt-0.5 block text-xs font-normal">
                      {String(chapter.pageCount)} pages
                    </span>
                  </Label>
                  <span
                    className={
                      volumeId === undefined
                        ? 'text-status-warning text-xs'
                        : 'text-muted-foreground text-xs'
                    }
                  >
                    {volumeName(draft, volumeId)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="border-border bg-muted/30 space-y-4 border-t p-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="target-volume">Move selected chapters to</Label>
                <NativeSelect
                  disabled={draft.volumes.length === 0}
                  id="target-volume"
                  onChange={(event) => {
                    setTargetVolumeId(event.target.value);
                  }}
                  value={effectiveTargetVolumeId}
                >
                  {draft.volumes.length === 0 && <option value="">Create a volume first</option>}
                  {draft.volumes.map((volume) => (
                    <option key={volume.id} value={volume.id}>
                      Volume {volume.number}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Button
                disabled={selectedChapterIds.size === 0 || effectiveTargetVolumeId === ''}
                onClick={assignSelected}
              >
                <ArrowDownToLine />
                Assign selected
              </Button>
              <Button
                disabled={selectedChapterIds.size === 0}
                onClick={unassignSelected}
                variant="outline"
              >
                Unassign
              </Button>
            </div>

            <fieldset className="border-border grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
              <legend className="text-muted-foreground px-1 text-xs font-medium">
                Assign an inclusive range
              </legend>
              <div className="space-y-2">
                <Label htmlFor="range-start">From</Label>
                <NativeSelect
                  id="range-start"
                  onChange={(event) => {
                    setRangeStart(event.target.value);
                  }}
                  value={rangeStart}
                >
                  {draft.chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="range-end">Through</Label>
                <NativeSelect
                  id="range-end"
                  onChange={(event) => {
                    setRangeEnd(event.target.value);
                  }}
                  value={rangeEnd}
                >
                  {draft.chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="range-volume">Volume</Label>
                <NativeSelect
                  disabled={draft.volumes.length === 0}
                  id="range-volume"
                  onChange={(event) => {
                    setTargetVolumeId(event.target.value);
                  }}
                  value={effectiveTargetVolumeId}
                >
                  {draft.volumes.length === 0 && <option value="">Create a volume first</option>}
                  {draft.volumes.map((volume) => (
                    <option key={volume.id} value={volume.id}>
                      Volume {volume.number}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Button
                disabled={rangeStart === '' || rangeEnd === '' || effectiveTargetVolumeId === ''}
                onClick={() => {
                  dispatch({
                    type: 'assign-range',
                    volumeId: effectiveTargetVolumeId,
                    firstChapterId: rangeStart,
                    lastChapterId: rangeEnd,
                  });
                }}
                variant="outline"
              >
                Assign range
              </Button>
            </fieldset>
          </div>
        </section>

        <div className="space-y-6">
          <section
            aria-labelledby="volumes-title"
            className="border-border bg-surface rounded-xl border p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="volumes-title" className="text-sm font-semibold">
                  Volumes
                </h2>
                <p className="text-muted-foreground mt-1 text-xs">
                  {String(draft.volumes.length)} created
                </p>
              </div>
              <div className="flex items-end gap-2">
                <div className="space-y-2">
                  <Label className="sr-only" htmlFor="new-volume-number">
                    New volume number
                  </Label>
                  <Input
                    className="w-20"
                    id="new-volume-number"
                    inputMode="decimal"
                    onChange={(event) => {
                      setNewVolumeNumber(event.target.value);
                    }}
                    value={newVolumeNumber}
                  />
                </div>
                <Button aria-label="Add volume" onClick={addNewVolume} size="icon">
                  <Plus />
                </Button>
              </div>
            </div>

            {draft.volumes.length === 0 ? (
              <div className="border-border text-muted-foreground mt-5 rounded-lg border border-dashed px-4 py-8 text-center text-sm">
                Create the first volume, then assign chapters to it.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {draft.volumes.map((volume, index) => (
                  <article
                    className="border-border bg-background rounded-lg border p-4"
                    key={volume.id}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 space-y-2">
                        <Label htmlFor={`volume-number-${volume.id}`}>Volume number</Label>
                        <Input
                          aria-label={`Volume number for volume ${volume.number}`}
                          defaultValue={volume.number}
                          id={`volume-number-${volume.id}`}
                          inputMode="decimal"
                          key={`${volume.id}-${volume.number}`}
                          onBlur={(event) => {
                            if (event.target.value !== volume.number) {
                              dispatch({
                                type: 'renumber-volume',
                                volumeId: volume.id,
                                number: event.target.value,
                              });
                            }
                          }}
                        />
                      </div>
                      <Button
                        aria-label={`Remove volume ${volume.number}`}
                        onClick={() => {
                          dispatch({ type: 'remove-volume', volumeId: volume.id });
                        }}
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <p className="text-muted-foreground mt-3 text-xs">
                      {String(volume.chapterIds.length)} chapter
                      {volume.chapterIds.length === 1 ? '' : 's'}
                    </p>
                    {volume.chapterIds.length > 1 && (
                      <div className="mt-3 space-y-2">
                        <Label htmlFor={`split-${volume.id}`}>Split before</Label>
                        <div className="flex gap-2">
                          <NativeSelect
                            id={`split-${volume.id}`}
                            defaultValue={volume.chapterIds[1]}
                          >
                            {volume.chapterIds.slice(1).map((chapterId) => (
                              <option key={chapterId} value={chapterId}>
                                {draft.chapters.find((chapter) => chapter.id === chapterId)?.name}
                              </option>
                            ))}
                          </NativeSelect>
                          <Button
                            aria-label={`Split volume ${volume.number}`}
                            onClick={(event) => {
                              const select =
                                event.currentTarget.parentElement?.querySelector('select');
                              if (select === undefined || select === null) return;
                              dispatch({
                                type: 'split-volume',
                                volumeId: volume.id,
                                firstChapterId: select.value,
                                newVolumeId: createVolumeId(),
                                newVolumeNumber: nextVolumeNumber(draft),
                              });
                            }}
                            size="icon"
                            variant="outline"
                          >
                            <Scissors />
                          </Button>
                        </div>
                      </div>
                    )}
                    {index > 0 && (
                      <Button
                        className="mt-3 w-full"
                        onClick={() => {
                          dispatch({
                            type: 'merge-volumes',
                            targetVolumeId: draft.volumes[index - 1]!.id,
                            sourceVolumeId: volume.id,
                          });
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        <GitMerge />
                        Merge into volume {draft.volumes[index - 1]!.number}
                      </Button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section
            aria-labelledby="validation-title"
            className="border-border bg-surface rounded-xl border p-5"
          >
            <h2 id="validation-title" className="text-sm font-semibold">
              Ready check
            </h2>
            {issues.length === 0 ? (
              <div className="text-status-complete mt-4 flex items-center gap-2 text-sm">
                <CheckCircle2 aria-hidden="true" className="size-4" />
                All chapters are ready to bind.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {errors.length > 0 && (
                  <div aria-label="Mapping errors" role="alert">
                    <p className="text-status-failed text-xs font-medium">Fix before continuing</p>
                    <ul className="mt-2 space-y-2">
                      {errors.map((issue, index) => (
                        <li
                          className="text-muted-foreground text-sm leading-5"
                          key={`${issue.code}-${String(index)}`}
                        >
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {warnings.length > 0 && (
                  <div aria-label="Mapping warnings" role="group">
                    <p className="text-status-warning text-xs font-medium">Check these chapters</p>
                    <ul className="mt-2 space-y-2">
                      {warnings.map((issue, index) => (
                        <li
                          className="text-muted-foreground text-sm leading-5"
                          key={`${issue.code}-${String(index)}`}
                        >
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <Button
              className="mt-5 w-full"
              disabled={errors.length > 0 || draft.volumes.length === 0}
              onClick={confirm}
            >
              Confirm mapping
            </Button>
          </section>
        </div>
      </div>
    </section>
  );
}
