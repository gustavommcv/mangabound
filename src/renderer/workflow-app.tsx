import { ChevronLeft, CircleAlert } from 'lucide-react';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import {
  type BookDetails,
  hasBookDetails,
  noBookDetails,
  persistableDetails,
} from '@/domain/book-details';
import { type BookFormat, type ConversionProgress, plannedSingleBook } from '@/domain/conversion';
import {
  emptyQueue,
  type InspectedRow,
  isPendingTitle,
  type QueueInput,
  queueReducer,
  rowMode,
  runnableRows,
  sessionIds,
} from '@/domain/input-queue';
import { dominantLanguage, type MappingDraft, mappingSignature } from '@/domain/mapping';
import {
  defaultMangapressSettings,
  type MangapressSettings,
  resolveDeviceProfileFallback,
  withDeviceProfile,
} from '@/domain/output-profile';
import { defaultFormat } from '@/domain/preferences';
import {
  defaultProcessMode,
  type ProcessMode,
  resolveMode,
  usesMangapress,
} from '@/domain/process-mode';
import {
  describeRun,
  finishRunReport,
  reportInputRun,
  reportLibraryRun,
} from '@/domain/run-report';
import {
  MappingEditor,
  type MappingEditorProps,
} from '@/renderer/components/mapping/mapping-editor';
import { Notices } from '@/renderer/components/shared/notices';
import { SendToKoreader } from '@/renderer/components/sharing/send-to-koreader';
import { SharePanel } from '@/renderer/components/sharing/share-panel';
import { ShareMenu } from '@/renderer/components/sharing/share-menu';
import { useKeptSettings } from '@/renderer/hooks/use-kept-settings';
import { usePendingRuns } from '@/renderer/hooks/use-pending-runs';
import { useSharing } from '@/renderer/hooks/use-sharing';
import { useToolchain } from '@/renderer/hooks/use-toolchain';
import { resolveNetworkInterface } from '@/renderer/lib/sharing';
import { Titlebar } from '@/renderer/components/shell/titlebar';
import { Button } from '@/renderer/components/ui/button';
import { type AuthorLookup } from '@/renderer/components/details/author-lookup';
import { BookDetailsScreen } from '@/renderer/screens/book-details-screen';
import { ConversionOptionsScreen } from '@/renderer/screens/conversion-options-screen';
import { LibraryScreen } from '@/renderer/screens/library-screen';
import { QueueScreen, type RowPlan } from '@/renderer/screens/queue-screen';
import { ResultsScreen, type RunOutcome } from '@/renderer/screens/results-screen';
import { RunningScreen } from '@/renderer/screens/running-screen';
import type { MangaboundBridge } from '@/shared/runtime-info';
import type { ToolchainStatus } from '@/shared/toolchain-status';
import type {
  ConversionCommand,
  LibraryPlanSummary,
  MetadataProviderDescriptor,
  MetadataSearchResult,
  PlanSummary,
  PlanConversionCommand,
  RegisteredInputs,
  SelectedInput,
  VolumeSuggestion,
  WorkflowFailure,
} from '@/shared/workflow-contract';

type EditingTarget =
  | { readonly kind: 'input'; readonly rowId: string }
  | { readonly kind: 'title'; readonly rowId: string; readonly title: string };

/** A screen and its target travel together; non-editing screens keep no stale selection. */
type WorkflowNavigation =
  | { readonly screen: 'queue' | 'options' | 'running' | 'results' }
  | { readonly screen: 'library'; readonly rowId: string }
  | { readonly screen: 'mapping' | 'details'; readonly target: EditingTarget };

/** The volumes of a mapping, numbered, in order: what a series of books is made of. */
const volumeNumbers = (mapping: MappingDraft | undefined): readonly number[] =>
  (mapping?.volumes ?? [])
    .map((volume) => Number(volume.number))
    .filter((number) => Number.isFinite(number))
    .sort((left, right) => left - right);

const plural = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? '' : 's'}`;

const withNotice = (current: readonly string[], message: string): readonly string[] =>
  current.includes(message) ? current : [...current, message];

/** What validating a library shows: the books its ready titles would be joined into. */
function libraryPlanSummary(
  row: InspectedRow,
  planned: LibraryPlanSummary,
  process: ProcessMode,
  singleBook: boolean,
): PlanSummary {
  const pending = new Set((row.titles ?? []).filter(isPendingTitle).map((title) => title.title));
  const titles = planned.titles.filter((title) => pending.has(title.title));
  const volumes = titles.flatMap((title) => title.volumes);
  const books = singleBook
    ? titles.map((title) => plannedSingleBook(title.title, title.volumes))
    : volumes;
  return {
    tool: 'mangabind',
    title: row.displayName,
    message: `mangabind validated ${plural(titles.length, 'title')} · ${plural(volumes.length, 'volume')}${singleBook ? ` · ${plural(books.length, 'EPUB')} (one per series)` : process === 'bind-only' ? ' · saved as CBZ files, mangapress not run' : ''} · no library files written`,
    books,
    issues: planned.issues,
  };
}

const toQueueInput = (input: SelectedInput): QueueInput => ({
  id: input.selectionId,
  kind: input.kind,
  displayName: input.displayName,
  displayPath: input.displayPath,
});

/** The workflow depends on the bridge interface, not on where its implementation comes from. */
export function WorkflowApp({ bridge }: { readonly bridge: MangaboundBridge }): React.JSX.Element {
  const [failure, setFailure] = useState<WorkflowFailure>();
  const { toolchain, profiles } = useToolchain(bridge, setFailure);
  const [navigation, setNavigation] = useState<WorkflowNavigation>({ screen: 'queue' });
  const [rows, dispatch] = useReducer(queueReducer, emptyQueue);
  const [rejected, setRejected] = useState<
    readonly { readonly name: string; readonly reason: string }[]
  >([]);
  const [activeRunId, setActiveRunId] = useState<string>();
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(new Set());
  const [notices, setNotices] = useState<readonly string[]>([]);
  const notify = useCallback((message: string) => {
    setNotices((current) => withNotice(current, message));
  }, []);
  const {
    mode,
    setMode,
    format,
    setFormat,
    settings,
    setSettings,
    singleBook,
    setSingleBook,
    selectedProviderId,
    setSelectedProviderId,
    preferredNetworkInterface,
    setPreferredNetworkInterface,
  } = useKeptSettings(bridge, notify);
  // A standalone CBZ is already one book. Keep the saved choice for a later folder, but do not
  // present its grouping/EPUB locks as active while the queue contains only CBZ files.
  const singleBookActive =
    singleBook && !(rows.length > 0 && rows.every((row) => row.kind === 'cbz'));
  const [jobId, setJobId] = useState<string>();
  const [progress, setProgress] = useState<ConversionProgress>();
  const [runPosition, setRunPosition] = useState<{
    readonly name: string;
    readonly index: number;
    readonly total: number;
  }>();
  const [outcomes, setOutcomes] = useState<readonly RunOutcome[]>([]);
  const [resultSummary, setResultSummary] = useState<string>();
  const [validated, setValidated] = useState<{
    readonly key: string;
    readonly plans: readonly RowPlan[];
  }>();
  const [validating, setValidating] = useState(false);
  const [metadataProviders, setMetadataProviders] = useState<readonly MetadataProviderDescriptor[]>(
    [],
  );
  const rowsRef = useRef(rows);
  const attemptedInspection = useRef(new Set<string>());
  const cancelRequested = useRef(false);
  const {
    pendingRuns,
    refresh: refreshPendingRuns,
    discard: discardPendingBooks,
  } = usePendingRuns(bridge, setFailure);

  useEffect(() => {
    return bridge.onConversionProgress((update) => {
      if (update.jobId === jobId) setProgress(update);
    });
  }, [bridge, jobId]);

  const sharing = useSharing(bridge, setFailure);

  useEffect(() => {
    let current = true;
    // Optional feature: never let this lookup surface as an error. No providers just means no panel.
    void bridge
      .listMetadataProviders()
      .then((result) => {
        if (current && result.ok) setMetadataProviders(result.value);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [bridge]);

  useEffect(() => {
    rowsRef.current = rows;
  });

  // Each new row is read once: a scan of the folder (or a check of the file) that leaves a scratch
  // session behind. One add reads its rows one after another; a later add starts its own pass.
  useEffect(() => {
    const fresh = rows.filter(
      (row) => row.state === 'inspecting' && !attemptedInspection.current.has(row.id),
    );
    if (fresh.length === 0) return;
    for (const row of fresh) attemptedInspection.current.add(row.id);
    void (async () => {
      for (const row of fresh) {
        const result = await bridge.inspectInput(row.id);
        if (!result.ok) {
          dispatch({ type: 'inspect-failed', id: row.id, message: result.error.message });
          continue;
        }
        if (!rowsRef.current.some((candidate) => candidate.id === row.id)) {
          // Removed while it was being read: nothing is waiting for this session.
          void bridge.releaseInput(result.value.sessionId);
          continue;
        }
        dispatch({
          type: 'inspected',
          id: row.id,
          sessionId: result.value.sessionId,
          // A folder may turn out to be a library once it has been read.
          kind: result.value.kind,
          ...(result.value.mapping === undefined ? {} : { mapping: result.value.mapping }),
          ...(result.value.titles === undefined ? {} : { titles: result.value.titles }),
          ...(result.value.details === undefined ? {} : { details: result.value.details }),
        });
      }
    })();
  }, [bridge, rows]);

  // A file dropped anywhere but on the queue would make the window try to open it. The queue
  // handles its own drops; everywhere else they are ignored.
  useEffect(() => {
    const ignore = (event: DragEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('dragover', ignore);
    window.addEventListener('drop', ignore);
    return () => {
      window.removeEventListener('dragover', ignore);
      window.removeEventListener('drop', ignore);
    };
  }, []);

  const releaseSessions = (ids: readonly string[]): void => {
    for (const id of ids) void bridge.releaseInput(id);
  };

  const removeRows = (ids: readonly string[]): void => {
    const gone = rows.filter((row) => ids.includes(row.id));
    dispatch({ type: 'remove', ids });
    releaseSessions(sessionIds(gone));
  };

  const addRegistered = (registered: RegisteredInputs): void => {
    setRejected(registered.rejected);
    if (registered.inputs.length > 0) {
      dispatch({ type: 'add', inputs: registered.inputs.map(toQueueInput) });
    }
  };

  const addFromDialog = async (kind: 'files' | 'folders'): Promise<void> => {
    setFailure(undefined);
    const result = await bridge.chooseInputs(kind);
    if (!result.ok) setFailure(result.error);
    else addRegistered(result.value);
  };

  const addDropped = async (files: readonly File[]): Promise<void> => {
    setFailure(undefined);
    const result = await bridge.registerDroppedFiles(files);
    if (!result.ok) setFailure(result.error);
    else addRegistered(result.value);
  };

  /**
   * What a run sends for the chosen process. When mangapress is not run its settings are
   * irrelevant, so defaults go instead of whatever half-edited values are on screen: they would
   * otherwise fail validation for a step that never happens.
   */
  const withRunSettings = <M extends ProcessMode>(
    resolved: M,
  ): { readonly mode: M; readonly settings: MangapressSettings; readonly format: BookFormat } =>
    usesMangapress(resolved)
      ? { mode: resolved, settings, format }
      : { mode: resolved, settings: defaultMangapressSettings, format: 'cbz' };
  /** The command for one queue row. A folder sent straight to mangapress carries no volumes. */
  const planCommandFor = (
    row: InspectedRow,
    rowProcess: ProcessMode,
    commandJobId: string,
  ): PlanConversionCommand => ({
    jobId: commandJobId,
    sessionId: row.sessionId,
    singleBook: row.kind === 'cbz' ? false : singleBook,
    ...withRunSettings(rowProcess),
    ...(row.mapping === undefined || rowProcess === 'convert-only' ? {} : { mapping: row.mapping }),
    // What was typed only matters where mangapress makes the book.
    ...(usesMangapress(rowProcess) && row.details !== undefined && hasBookDetails(row.details)
      ? { details: row.details }
      : {}),
  });
  const commandFor = (
    row: InspectedRow,
    rowProcess: ProcessMode,
    libraryId: string,
    commandJobId: string,
  ): ConversionCommand => ({ ...planCommandFor(row, rowProcess, commandJobId), libraryId });

  // A validated plan only describes the queue, process and settings it was made for.
  const planKey = JSON.stringify([
    mode,
    format,
    settings,
    singleBook,
    rows.map((row) => [
      row.id,
      row.state,
      row.state === 'inspected' && row.mapping !== undefined ? mappingSignature(row.mapping) : '',
      row.state === 'inspected' ? row.confirmed : false,
      row.state === 'inspected'
        ? (row.titles ?? []).map((title) => [
            title.title,
            title.volumes.length,
            title.outcome?.status,
            title.details ?? null,
          ])
        : [],
      row.state === 'inspected' ? (row.details ?? null) : null,
    ]),
  ]);
  const plans = validated?.key === planKey ? validated.plans : undefined;

  const validatePlans = async (): Promise<void> => {
    setFailure(undefined);
    setValidating(true);
    const collected: RowPlan[] = [];
    try {
      for (const { row, mode: rowProcess } of runnableRows(rows, mode)) {
        if (row.kind === 'library') {
          const planned = await bridge.planLibrary(crypto.randomUUID(), row.sessionId);
          if (!planned.ok) {
            setFailure(planned.error);
            return;
          }
          collected.push({
            name: row.displayName,
            plan: libraryPlanSummary(row, planned.value, rowProcess, singleBook),
          });
          continue;
        }
        const result = await bridge.planConversion(
          planCommandFor(row, rowProcess, crypto.randomUUID()),
        );
        if (!result.ok) {
          setFailure(result.error);
          return;
        }
        collected.push({ name: row.displayName, plan: result.value });
      }
      setValidated({ key: planKey, plans: collected });
    } finally {
      setValidating(false);
    }
  };

  const startRun = async (): Promise<void> => {
    const items = runnableRows(rows, mode);
    if (items.length === 0) return;
    setFailure(undefined);
    const created = await bridge.createPendingRun();
    if (!created.ok) {
      setFailure(created.error);
      return;
    }
    const runId = created.value;
    setActiveRunId(runId);
    setSavedIds(new Set());
    cancelRequested.current = false;
    setNavigation({ screen: 'running' });
    const settled: RunOutcome[] = [];
    // Titles that produced books in this run, so completed library rows can leave the queue.
    const completedTitles = new Map<string, ReadonlySet<string>>();
    // The rows a run got to; those it did not (it was cancelled first) are not reported as left out.
    const attempted = new Set<string>();
    for (const [index, { row, mode: rowProcess }] of items.entries()) {
      if (cancelRequested.current) break;
      attempted.add(row.id);
      const nextJobId = crypto.randomUUID();
      setJobId(nextJobId);
      setRunPosition({ name: row.displayName, index: index + 1, total: items.length });
      setProgress({ stage: 'processing', message: 'Preparing…' });
      if (row.kind === 'library') {
        const libraryProcess = resolveMode('library', rowProcess);
        const pendingTitles = (row.titles ?? []).filter(isPendingTitle);
        const titleDetails = usesMangapress(libraryProcess)
          ? pendingTitles.flatMap((title) =>
              title.details !== undefined && hasBookDetails(title.details)
                ? [{ title: title.title, details: title.details }]
                : [],
            )
          : [];
        const ran = await bridge.convertLibrary({
          jobId: nextJobId,
          sessionId: row.sessionId,
          libraryId: runId,
          singleBook,
          ...withRunSettings(libraryProcess),
          titles: pendingTitles.map((title) => title.title),
          ...(titleDetails.length === 0 ? {} : { titleDetails }),
        });
        const report = reportLibraryRun(row, ran);
        settled.push(...report.outcomes);
        if (report.cancelled) cancelRequested.current = true;
        if (report.completedTitles !== undefined)
          completedTitles.set(row.id, report.completedTitles);
        if (report.queueUpdate !== undefined) dispatch(report.queueUpdate);
        continue;
      }
      const result = await bridge.convert(commandFor(row, rowProcess, runId, nextJobId));
      const report = reportInputRun(row, result);
      settled.push(...report.outcomes);
      if (report.cancelled) cancelRequested.current = true;
    }
    setJobId(undefined);
    setProgress(undefined);
    setRunPosition(undefined);
    const report = finishRunReport({ rows, mode, settled, attempted, completedTitles });
    removeRows(report.completedRowIds);
    if (!report.hasResults) {
      setNavigation({ screen: 'queue' });
      return;
    }
    setOutcomes(report.outcomes);
    setResultSummary(describeRun(mode, deviceName, format));
    await refreshPendingRuns();
    setNavigation({ screen: 'results' });
  };

  const cancelConversion = async (): Promise<void> => {
    if (jobId === undefined) return;
    cancelRequested.current = true;
    const result = await bridge.cancelConversion(jobId);
    if (!result.ok) setFailure(result.error);
  };

  // What was kept with the folder when its details were opened, so leaving them saves only a change.
  const keptOnOpen = useRef<BookDetails>(noBookDetails);

  const openDetails = (rowId: string): void => {
    const row = rows.find((candidate) => candidate.id === rowId);
    keptOnOpen.current = persistableDetails(
      row?.state === 'inspected' ? (row.details ?? noBookDetails) : noBookDetails,
    );
    setNavigation({ screen: 'details', target: { kind: 'input', rowId } });
  };

  const openTitleDetails = (row: InspectedRow, title: string): void => {
    keptOnOpen.current = persistableDetails(
      row.titles?.find((candidate) => candidate.title === title)?.details ?? noBookDetails,
    );
    setNavigation({ screen: 'details', target: { kind: 'title', rowId: row.id, title } });
  };

  /**
   * Keeps the author and language of a folder with it once their page is left, when they changed.
   * It never stops anyone: what could not be kept is said, and the details stay for this session.
   */
  const keepDetails = (
    row: InspectedRow,
    title: string | undefined,
    current: BookDetails,
  ): void => {
    const kept = persistableDetails(current);
    if (JSON.stringify(kept) === JSON.stringify(keptOnOpen.current)) return;
    void bridge
      .saveBookDetails({
        sessionId: row.sessionId,
        ...(title === undefined ? {} : { title }),
        details: kept,
      })
      .then((result) => {
        if (!result.ok) notify(result.error.message);
      });
  };

  const openEditor = (rowId: string): void => {
    setNavigation(
      rows.find((row) => row.id === rowId)?.kind === 'library'
        ? { screen: 'library', rowId }
        : { screen: 'mapping', target: { kind: 'input', rowId } },
    );
  };

  const confirmTitleMapping = async (
    row: InspectedRow,
    title: string,
    draft: MappingDraft,
  ): Promise<void> => {
    setFailure(undefined);
    const written = await bridge.writeTitleMapping(row.sessionId, title, draft);
    if (!written.ok) {
      setFailure(written.error);
      return;
    }
    // The library is read again: the title now has its volumes, and the rest is as it was found.
    const planned = await bridge.planLibrary(crypto.randomUUID(), row.sessionId);
    if (!planned.ok) {
      setFailure(planned.error);
      return;
    }
    dispatch({ type: 'library-planned', id: row.id, titles: planned.value.titles });
    setNavigation({ screen: 'library', rowId: row.id });
  };

  const runArtifactAction = async (
    action: (
      artifactId: string,
    ) => Promise<
      | { readonly ok: true; readonly value: undefined }
      | { readonly ok: false; readonly error: WorkflowFailure }
    >,
    artifactId: string,
  ): Promise<void> => {
    const result = await action(artifactId);
    if (!result.ok) setFailure(result.error);
  };

  const searchMetadata = async (
    providerId: string,
    title: string,
    signal: AbortSignal,
  ): Promise<readonly MetadataSearchResult[]> => {
    const searchJobId = crypto.randomUUID();
    signal.addEventListener('abort', () => {
      void bridge.cancelConversion(searchJobId);
    });
    const result = await bridge.searchMetadata(searchJobId, providerId, title);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };

  const suggestVolumes = async (
    providerId: string,
    workId: string,
    language?: string,
  ): Promise<{ readonly volumes: readonly VolumeSuggestion[] }> => {
    const result = await bridge.suggestVolumes(crypto.randomUUID(), providerId, workId, language);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };

  const openProviderHomepage = (providerId: string): void => {
    void bridge.openProviderHomepage(providerId).then((result) => {
      if (!result.ok) setFailure(result.error);
    });
  };

  const openPendingRun = (libraryId: string): void => {
    const run = pendingRuns.find((candidate) => candidate.libraryId === libraryId);
    if (run === undefined) return;
    setActiveRunId(libraryId);
    setSavedIds(
      new Set(run.artifacts.filter((artifact) => artifact.saved).map((artifact) => artifact.id)),
    );
    setOutcomes([
      {
        rowId: libraryId,
        name: 'Earlier conversion',
        status: 'done',
        artifacts: run.artifacts,
      },
    ]);
    setResultSummary('Ready to save or share');
    setNavigation({ screen: 'results' });
  };

  const discardPendingRun = async (libraryId: string): Promise<boolean> => {
    setFailure(undefined);
    if (!(await discardPendingBooks(libraryId))) return false;
    sharing.forgetLibrary(libraryId);
    if (activeRunId === libraryId) setActiveRunId(undefined);
    return true;
  };

  const saveArtifactAs = async (artifactId: string): Promise<void> => {
    setFailure(undefined);
    const result = await bridge.saveArtifactAs(artifactId);
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    if (!result.value.saved) return;
    setSavedIds((current) => new Set([...current, artifactId]));
    if (result.value.warning !== undefined) notify(result.value.warning);
    await refreshPendingRuns();
  };

  const saveAllArtifacts = async (artifactIds: readonly string[]): Promise<void> => {
    setFailure(undefined);
    const result = await bridge.saveAllArtifacts(artifactIds);
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    if (result.value === null) return;
    const saved = result.value;
    setSavedIds((current) => new Set([...current, ...saved.savedIds]));
    for (const item of saved.failures) {
      const name =
        outcomes.flatMap((outcome) => outcome.artifacts).find((artifact) => artifact.id === item.id)
          ?.name ?? 'A book';
      notify(`${name}: ${item.message}`);
    }
    await refreshPendingRuns();
  };

  const resetMangapress = (): void => {
    setFormat(defaultFormat);
    setSettings(defaultMangapressSettings);
  };

  const resetAll = (): void => {
    setMode(defaultProcessMode);
    setSingleBook(false);
    resetMangapress();
  };

  const handleSingleBook = (nextSingleBook: boolean): void => {
    setSingleBook(nextSingleBook);
    setSettings((prev) =>
      prev.combineIntoOneVolume ? { ...prev, combineIntoOneVolume: false } : prev,
    );
    if (nextSingleBook) {
      setMode('bind-and-convert');
      setFormat('epub');
    }
  };

  const handleMode = (nextMode: ProcessMode): void => {
    if (!singleBookActive) {
      if (singleBook) setSingleBook(false);
      setMode(nextMode);
    }
  };

  const handleFormat = (nextFormat: BookFormat): void => {
    if (!singleBookActive) {
      if (singleBook && nextFormat !== 'epub') setSingleBook(false);
      setFormat(nextFormat);
    }
  };

  // The source chosen last time only counts while the list still has it.
  const activeProviderId = metadataProviders.some((provider) => provider.id === selectedProviderId)
    ? selectedProviderId
    : undefined;
  const selectedNetworkInterface = resolveNetworkInterface(
    sharing.interfaces,
    preferredNetworkInterface,
  );
  // Both MappingEditor placements (a single input, one title of a library) offer the same online
  // sources the same way; only the draft, its confirm/skip behavior and where it came from differ.
  const metadataProviderProps: Pick<
    MappingEditorProps,
    | 'metadataProviders'
    | 'onOpenProviderHomepage'
    | 'onSearchMetadata'
    | 'onSelectProvider'
    | 'onSuggestVolumes'
    | 'selectedProviderId'
  > = {
    metadataProviders,
    onOpenProviderHomepage: openProviderHomepage,
    onSearchMetadata: searchMetadata,
    onSelectProvider: setSelectedProviderId,
    onSuggestVolumes: suggestVolumes,
    selectedProviderId: activeProviderId,
  };

  // The same sources answer for who wrote a work, chosen and kept the same way.
  const authorLookup: AuthorLookup = {
    onOpenHomepage: openProviderHomepage,
    onSearch: searchMetadata,
    onSelect: setSelectedProviderId,
    providers: metadataProviders,
    selectedId: activeProviderId,
  };

  const editingTarget =
    navigation.screen === 'mapping' || navigation.screen === 'details'
      ? navigation.target
      : undefined;
  const editingRow =
    navigation.screen === 'library'
      ? rows.find((row) => row.id === navigation.rowId)
      : editingTarget !== undefined
        ? rows.find((row) => row.id === editingTarget.rowId)
        : undefined;
  // A library's titles can have their own details only where mangapress makes their books.
  const libraryProcess = rowMode('library', mode);
  const libraryMakesBooks = libraryProcess !== 'skip' && usesMangapress(libraryProcess);
  const editingTitleEntry =
    editingTarget?.kind === 'title' && editingRow?.state === 'inspected'
      ? editingRow.titles?.find((title) => title.title === editingTarget.title)
      : undefined;
  // A device the tools no longer list cannot be converted for, whether it came from the file or is
  // the default. This adjusts state while rendering, the way React documents for state that follows
  // other state, so the screen never shows it selected.
  const deviceProfileFallback = resolveDeviceProfileFallback(settings.deviceProfile, profiles);
  if (deviceProfileFallback !== undefined) {
    notify(
      `The device profile ${settings.deviceProfile} is not available, so ${deviceProfileFallback.name} is selected.`,
    );
    setSettings(withDeviceProfile(settings, deviceProfileFallback.code));
  }
  const deviceName =
    profiles.find((profile) => profile.code === settings.deviceProfile)?.name ??
    settings.deviceProfile;

  return (
    // The title bar stays where it is and only what is under it scrolls (ADR 0016).
    <div className="bg-background text-foreground flex h-screen flex-col">
      <Titlebar platform={bridge.runtime.platform} version={bridge.runtime.version}>
        <ShareMenu
          onOpenChange={sharing.setPanelOpen}
          open={sharing.panelOpen}
          sharing={sharing.status.active}
        >
          <SharePanel
            interfaces={sharing.interfaces}
            selectedInterface={selectedNetworkInterface}
            library={sharing.library}
            onChooseLibrary={() => {
              void sharing.chooseLibrary();
            }}
            onStart={(interfaceAddress, auth) => {
              void sharing.start(interfaceAddress, auth);
            }}
            onSelectInterface={setPreferredNetworkInterface}
            onStop={() => {
              void sharing.stop();
            }}
            status={sharing.status}
          />
        </ShareMenu>
      </Titlebar>
      {/* The line under the bar is this area's top edge: see Titlebar for why it is not the bar's. */}
      <div className="border-border min-h-0 flex-1 overflow-y-auto border-t">
        <main className="mx-auto max-w-6xl px-8 py-10">
          <ToolchainBanner toolchain={toolchain} />
          <Notices
            notices={notices}
            onDismiss={() => {
              setNotices([]);
            }}
          />
          {failure !== undefined && <IssueCallout failure={failure} />}
          {navigation.screen === 'queue' && (
            <QueueScreen
              disabled={toolchain?.state !== 'ready'}
              format={format}
              mode={mode}
              pendingRuns={pendingRuns}
              onOpenPending={openPendingRun}
              onDeletePending={discardPendingRun}
              onAddFiles={() => {
                void addFromDialog('files');
              }}
              onAddFolders={() => {
                void addFromDialog('folders');
              }}
              onClear={() => {
                removeRows(rows.map((row) => row.id));
              }}
              onConvert={() => {
                void startRun();
              }}
              onDeviceProfile={(code) => {
                setSettings((current) => withDeviceProfile(current, code));
              }}
              onDismissRejected={() => {
                setRejected([]);
              }}
              onDropFiles={(files) => {
                void addDropped(files);
              }}
              onEdit={openEditor}
              onEditDetails={openDetails}
              onFormat={handleFormat}
              onMode={handleMode}
              onOpenOptions={() => {
                setNavigation({ screen: 'options' });
              }}
              onRemove={(id) => {
                removeRows([id]);
              }}
              onReset={resetAll}
              onSingleBook={handleSingleBook}
              onValidate={() => {
                void validatePlans();
              }}
              {...(plans === undefined ? {} : { plans })}
              profiles={profiles}
              rejected={rejected}
              rows={rows}
              settings={settings}
              singleBook={singleBook}
              validating={validating}
            />
          )}
          {navigation.screen === 'options' && (
            <ConversionOptionsScreen
              format={format}
              onBack={() => {
                setNavigation({ screen: 'queue' });
              }}
              onFormat={handleFormat}
              onNotify={notify}
              onReset={resetMangapress}
              onSettings={setSettings}
              profiles={profiles}
              settings={settings}
              singleBook={singleBookActive}
            />
          )}
          {navigation.screen === 'mapping' &&
            navigation.target.kind === 'input' &&
            editingRow?.state === 'inspected' &&
            editingRow.mapping !== undefined && (
              <div className="space-y-4">
                <Button
                  onClick={() => {
                    setNavigation({ screen: 'queue' });
                  }}
                  variant="ghost"
                >
                  <ChevronLeft /> Queue
                </Button>
                <MappingEditor
                  initialDraft={editingRow.mapping}
                  onConfirm={(_metadata, draft) => {
                    dispatch({ type: 'confirm-mapping', id: editingRow.id, mapping: draft });
                    setNavigation({ screen: 'queue' });
                  }}
                  onSkipGrouping={() => {
                    setMode('convert-only');
                    setNavigation({ screen: 'queue' });
                  }}
                  singleBook={singleBook}
                  {...metadataProviderProps}
                  startedFrom={
                    editingRow.proposedSignature !== undefined &&
                    editingRow.mapping.volumes.length > 0 &&
                    mappingSignature(editingRow.mapping) === editingRow.proposedSignature
                      ? 'mangabind'
                      : undefined
                  }
                />
              </div>
            )}
          {navigation.screen === 'library' &&
            editingRow?.state === 'inspected' &&
            editingRow.titles !== undefined && (
              <LibraryScreen
                name={editingRow.displayName}
                onBack={() => {
                  setNavigation({ screen: 'queue' });
                }}
                onEdit={(title) => {
                  setNavigation({
                    screen: 'mapping',
                    target: { kind: 'title', rowId: editingRow.id, title },
                  });
                }}
                {...(libraryMakesBooks
                  ? {
                      onEditDetails: (title: string) => {
                        openTitleDetails(editingRow, title);
                      },
                    }
                  : {})}
                singleBook={singleBook}
                titles={editingRow.titles}
              />
            )}
          {navigation.screen === 'mapping' &&
            navigation.target.kind === 'title' &&
            editingRow?.state === 'inspected' &&
            editingTitleEntry !== undefined && (
              <div className="space-y-4">
                <Button
                  onClick={() => {
                    setNavigation({ screen: 'library', rowId: editingRow.id });
                  }}
                  variant="ghost"
                >
                  <ChevronLeft /> {editingRow.displayName}
                </Button>
                <MappingEditor
                  initialDraft={editingTitleEntry.draft}
                  key={editingTitleEntry.title}
                  onConfirm={(_metadata, draft) => {
                    void confirmTitleMapping(editingRow, editingTitleEntry.title, draft);
                  }}
                  singleBook={singleBook}
                  {...metadataProviderProps}
                  startedFrom={editingTitleEntry.draft.volumes.length > 0 ? 'mangabind' : undefined}
                />
              </div>
            )}
          {navigation.screen === 'details' &&
            navigation.target.kind === 'input' &&
            editingRow?.state === 'inspected' &&
            editingRow.kind !== 'library' && (
              <BookDetailsScreen
                backLabel="Queue"
                declaredLanguage={dominantLanguage(editingRow.mapping?.chapters ?? [])}
                defaultLanguage={settings.language}
                defaultTitle={editingRow.displayName.replace(/\.cbz$/iu, '')}
                details={editingRow.details ?? noBookDetails}
                format={format}
                key={editingRow.id}
                lookup={authorLookup}
                name={editingRow.displayName}
                onBack={() => {
                  // A loose CBZ has no folder to keep anything with.
                  if (editingRow.kind === 'folder') {
                    keepDetails(editingRow, undefined, editingRow.details ?? noBookDetails);
                  }
                  setNavigation({ screen: 'queue' });
                }}
                onChange={(details) => {
                  dispatch({ type: 'set-details', id: editingRow.id, details });
                }}
                {...(editingRow.kind === 'folder' &&
                !singleBook &&
                rowMode(editingRow.kind, mode) === 'bind-and-convert'
                  ? { volumes: volumeNumbers(editingRow.mapping) }
                  : {})}
              />
            )}
          {navigation.screen === 'details' &&
            navigation.target.kind === 'title' &&
            editingRow?.state === 'inspected' &&
            editingTitleEntry !== undefined && (
              <BookDetailsScreen
                backLabel={editingRow.displayName}
                declaredLanguage={dominantLanguage(editingTitleEntry.draft.chapters)}
                defaultLanguage={settings.language}
                defaultTitle={editingTitleEntry.title}
                details={editingTitleEntry.details ?? noBookDetails}
                format={format}
                key={editingTitleEntry.title}
                lookup={authorLookup}
                name={editingTitleEntry.title}
                onBack={() => {
                  keepDetails(
                    editingRow,
                    editingTitleEntry.title,
                    editingTitleEntry.details ?? noBookDetails,
                  );
                  setNavigation({ screen: 'library', rowId: editingRow.id });
                }}
                onChange={(details) => {
                  dispatch({
                    type: 'set-title-details',
                    id: editingRow.id,
                    title: editingTitleEntry.title,
                    details,
                  });
                }}
                {...(singleBook ? {} : { volumes: volumeNumbers(editingTitleEntry.draft) })}
              />
            )}
          {navigation.screen === 'running' && (
            <RunningScreen
              onCancel={() => {
                void cancelConversion();
              }}
              {...(progress === undefined ? {} : { progress })}
              {...(runPosition === undefined ? {} : { position: runPosition })}
            />
          )}
          {navigation.screen === 'results' && (
            <ResultsScreen
              aside={
                outcomes.some((outcome) => outcome.artifacts.length > 0) &&
                activeRunId !== undefined ? (
                  <SendToKoreader
                    onOpen={() => {
                      sharing.shareBooks({
                        libraryId: activeRunId,
                        displayPath: 'Books ready to share',
                      });
                    }}
                    status={sharing.status}
                  />
                ) : undefined
              }
              onBack={() => {
                setOutcomes([]);
                setNavigation({ screen: 'queue' });
              }}
              onFix={(rowId) => {
                setOutcomes([]);
                openEditor(rowId);
              }}
              onOpen={(artifactId) => {
                void runArtifactAction(bridge.openArtifact, artifactId);
              }}
              onShow={(artifactId) => {
                void runArtifactAction(bridge.showArtifactInFolder, artifactId);
              }}
              onSaveAs={(artifactId) => {
                void saveArtifactAs(artifactId);
              }}
              onSaveAll={(artifactIds) => {
                void saveAllArtifacts(artifactIds);
              }}
              savedIds={savedIds}
              outcomes={outcomes}
              {...(resultSummary === undefined ? {} : { summary: resultSummary })}
            />
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * The bundled tools are mandatory: the app cannot run a conversion without them, so their startup
 * check is not something to narrate while it succeeds. Only a real problem is worth a banner.
 */
function ToolchainBanner({
  toolchain,
}: {
  readonly toolchain?: ToolchainStatus;
}): React.JSX.Element | null {
  if (toolchain === undefined || toolchain.state === 'ready') return null;
  return (
    <section
      aria-label="Bundled tool status"
      className="border-border bg-surface mb-8 flex items-start gap-3 rounded-lg border px-4 py-3"
    >
      <CircleAlert aria-hidden="true" className="text-status-warning mt-0.5 size-4" />
      <div>
        <h2 className="text-sm font-semibold">Conversion tools need attention</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">{toolchain.message}</p>
      </div>
    </section>
  );
}

export function IssueCallout({
  failure,
}: {
  readonly failure: WorkflowFailure;
}): React.JSX.Element {
  return (
    <section
      className="border-status-failed/50 bg-status-failed/10 mb-6 rounded-lg border p-4"
      aria-label="Workflow error"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <CircleAlert aria-hidden="true" className="text-status-failed mt-0.5 size-5 shrink-0" />
        <div>
          <h2 className="text-sm font-semibold">Couldn’t complete this step</h2>
          <p className="text-muted-foreground mt-1 text-sm leading-6">{failure.message}</p>
          {failure.issue?.diagnostic !== undefined && (
            <details className="mt-3">
              <summary className="text-muted-foreground cursor-pointer text-xs">
                Technical details
              </summary>
              <pre className="bg-background mt-2 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">
                {failure.issue.diagnostic}
              </pre>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}
