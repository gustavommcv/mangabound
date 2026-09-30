import { ArrowLeft, Boxes, ChevronLeft, CircleAlert, Library, RadioTower } from 'lucide-react';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import {
  type BookDetails,
  hasBookDetails,
  noBookDetails,
  persistableDetails,
} from '@/domain/book-details';
import { type BookFormat, type ConversionProgress, plannedSingleBook } from '@/domain/conversion';
import {
  describeRow,
  emptyQueue,
  type InspectedRow,
  isPendingTitle,
  isWaitingTitle,
  type QueueInput,
  queueReducer,
  rowMode,
  runnableRows,
  sessionIds,
  type TitleOutcome,
} from '@/domain/input-queue';
import { dominantLanguage, type MappingDraft, mappingSignature } from '@/domain/mapping';
import {
  defaultMangapressSettings,
  type MangapressSettings,
  resolveDeviceProfileFallback,
  validateMangapressSettings,
  withDeviceProfile,
} from '@/domain/output-profile';
import { defaultFormat, isDefaultMangapress } from '@/domain/preferences';
import {
  defaultProcessMode,
  type ProcessMode,
  resolveMode,
  usesMangapress,
} from '@/domain/process-mode';
import {
  MappingEditor,
  type MappingEditorProps,
} from '@/renderer/components/mapping/mapping-editor';
import { Notices } from '@/renderer/components/shared/notices';
import { MangapressSettingsEditor } from '@/renderer/components/settings/mangapress-settings';
import { ResetOptions } from '@/renderer/components/settings/reset-options';
import { SendToKoreader } from '@/renderer/components/sharing/send-to-koreader';
import { SharePanel } from '@/renderer/components/sharing/share-panel';
import { ShareMenu } from '@/renderer/components/sharing/share-menu';
import { resolveNetworkInterface } from '@/renderer/lib/sharing';
import { Titlebar } from '@/renderer/components/shell/titlebar';
import { Button } from '@/renderer/components/ui/button';
import { type AuthorLookup } from '@/renderer/components/details/author-lookup';
import { BookDetailsScreen } from '@/renderer/screens/book-details-screen';
import { LibraryScreen } from '@/renderer/screens/library-screen';
import { QueueScreen, type RowPlan } from '@/renderer/screens/queue-screen';
import { ResultsScreen, type RunOutcome } from '@/renderer/screens/results-screen';
import { RunningScreen } from '@/renderer/screens/running-screen';
import type {
  NetworkInterfaceOption,
  OpdsAuthConfig,
  OpdsSharingStatus,
} from '@/shared/opds-contract';
import type { MangaboundBridge } from '@/shared/runtime-info';
import type { SaveSettingsCommand } from '@/shared/settings-contract';
import type { ToolchainStatus } from '@/shared/toolchain-status';
import type {
  ConversionCommand,
  DeviceProfileSummary,
  LibraryPlanSummary,
  LibraryTitleResult,
  MetadataProviderDescriptor,
  MetadataSearchResult,
  PlanSummary,
  PlanConversionCommand,
  PendingRunSummary,
  RegisteredInputs,
  SelectedInput,
  SelectedLibrary,
  VolumeSuggestion,
  WorkflowFailure,
} from '@/shared/workflow-contract';

type WorkflowStep =
  | 'queue'
  | 'editing'
  | 'library'
  | 'editing-title'
  | 'details'
  | 'details-title'
  | 'options'
  | 'running'
  | 'results';

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

/** What is kept of the choices on screen. */
function settingsToKeep(values: {
  readonly mode: ProcessMode;
  readonly format: BookFormat;
  readonly settings: MangapressSettings;
  readonly singleBook: boolean;
  readonly providerId: string | undefined;
  readonly preferredNetworkInterface: NetworkInterfaceOption | undefined;
}): SaveSettingsCommand {
  return {
    preferences: {
      mode: values.mode,
      format: values.format,
      settings: values.settings,
      singleBook: values.singleBook,
      ...(values.providerId === undefined ? {} : { providerId: values.providerId }),
    },
    ...(values.preferredNetworkInterface === undefined
      ? {}
      : { preferredNetworkInterface: values.preferredNetworkInterface }),
  };
}

const outcomeOf = (title: LibraryTitleResult): TitleOutcome =>
  title.status === 'done'
    ? { status: 'done' }
    : { status: 'failed', message: title.failure?.message ?? 'It could not be converted.' };

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

const foundations = [
  {
    description: 'Pure rules and use cases stay independent of Electron and React.',
    icon: Boxes,
    title: 'Domain first',
  },
  {
    description: 'Pinned tools run behind typed, versioned adapter contracts.',
    icon: Library,
    title: 'Verified pipeline',
  },
  {
    description: 'Outputs will be indexed for a newest-first OPDS catalog.',
    icon: RadioTower,
    title: 'Reader delivery',
  },
] as const;

const toQueueInput = (input: SelectedInput): QueueInput => ({
  id: input.selectionId,
  kind: input.kind,
  displayName: input.displayName,
  displayPath: input.displayPath,
});

export function App(): React.JSX.Element {
  const bridge = window.mangabound;
  const [toolchain, setToolchain] = useState<ToolchainStatus>();
  const [profiles, setProfiles] = useState<readonly DeviceProfileSummary[]>([]);
  const [step, setStep] = useState<WorkflowStep>('queue');
  const [rows, dispatch] = useReducer(queueReducer, emptyQueue);
  const [rejected, setRejected] = useState<
    readonly { readonly name: string; readonly reason: string }[]
  >([]);
  const [editingId, setEditingId] = useState<string>();
  const [pendingRuns, setPendingRuns] = useState<readonly PendingRunSummary[]>([]);
  const [activeRunId, setActiveRunId] = useState<string>();
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(new Set());
  const [settings, setSettings] = useState<MangapressSettings>(defaultMangapressSettings);
  const [format, setFormat] = useState<BookFormat>(defaultFormat);
  const [mode, setMode] = useState<ProcessMode>(defaultProcessMode);
  const [singleBook, setSingleBook] = useState(false);
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
  const [failure, setFailure] = useState<WorkflowFailure>();
  const [editingTitle, setEditingTitle] = useState<string>();
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [sharedLibrary, setSharedLibrary] = useState<SelectedLibrary>();
  const [interfaces, setInterfaces] = useState<readonly NetworkInterfaceOption[]>([]);
  const [preferredNetworkInterface, setPreferredNetworkInterface] =
    useState<NetworkInterfaceOption>();
  const [sharingStatus, setSharingStatus] = useState<OpdsSharingStatus>({ active: false });
  const [metadataProviders, setMetadataProviders] = useState<readonly MetadataProviderDescriptor[]>(
    [],
  );
  // No online source is chosen until a person chooses one; it is then kept for the next title.
  const [selectedProviderId, setSelectedProviderId] = useState<string>();
  // What was kept from the last session is read once; nothing is saved before it has been (ADR 0014).
  const [restored, setRestored] = useState(false);
  // What was last read or written, so only a real change is written: a first launch leaves no file,
  // and a file that could not be read stays until something is changed.
  const lastKept = useRef<string | undefined>(undefined);
  const [notices, setNotices] = useState<readonly string[]>([]);
  const notify = useCallback((message: string) => {
    setNotices((current) => withNotice(current, message));
  }, []);
  const rowsRef = useRef(rows);
  const attemptedInspection = useRef(new Set<string>());
  const cancelRequested = useRef(false);
  // The options section is inline JSX, not its own component, so its heading can't get a plain
  // mount-only focus effect the way the other five screens do; this fires whenever `step` becomes
  // 'options', by which point the heading has already mounted (refs attach during commit, before
  // effects run).
  const optionsTitleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step === 'options') optionsTitleRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (bridge === undefined) return;
    let current = true;
    void bridge
      .getToolchainStatus()
      .then(async (status) => {
        if (!current) return;
        setToolchain(status);
        if (status.state !== 'ready' || bridge.getDeviceProfiles === undefined) return;
        const result = await bridge.getDeviceProfiles();
        if (!current) return;
        if (result.ok) setProfiles(result.value);
        else setFailure(result.error);
      })
      .catch(() => {
        if (current) {
          setToolchain({
            state: 'blocked',
            tools: [],
            message: 'The bundled conversion tools could not be checked.',
          });
        }
      });
    return () => {
      current = false;
    };
  }, [bridge]);

  useEffect(() => {
    if (bridge?.loadSettings === undefined) return;
    let current = true;
    void bridge
      .loadSettings()
      .then(
        (result) => (result.ok ? result.value : undefined),
        () => undefined,
      )
      .then((saved) => {
        if (!current) return;
        if (saved === undefined) {
          // Nothing is saved from here on: what is on screen is only the defaults, and saving
          // them would overwrite what was kept.
          notify('The saved settings could not be loaded.');
          return;
        }
        const restoredSingleBook = Boolean(saved.preferences.singleBook);
        const resolvedMode = restoredSingleBook ? 'bind-and-convert' : saved.preferences.mode;
        const resolvedFormat = restoredSingleBook ? 'epub' : saved.preferences.format;
        const resolvedSettings = {
          ...saved.preferences.settings,
          combineIntoOneVolume: false,
        };
        lastKept.current = JSON.stringify(
          settingsToKeep({
            ...saved.preferences,
            mode: resolvedMode,
            format: resolvedFormat,
            singleBook: restoredSingleBook,
            settings: resolvedSettings,
            providerId: saved.preferences.providerId,
            preferredNetworkInterface: saved.preferredNetworkInterface,
          }),
        );
        setSingleBook(restoredSingleBook);
        setMode(resolvedMode);
        setFormat(resolvedFormat);
        setSettings(resolvedSettings);
        setSelectedProviderId(saved.preferences.providerId);
        setPreferredNetworkInterface(saved.preferredNetworkInterface);
        for (const notice of saved.notices) notify(notice);
        setRestored(true);
      });
    return () => {
      current = false;
    };
  }, [bridge, notify]);

  useEffect(() => {
    if (bridge?.listPendingRuns === undefined) return;
    let current = true;
    void bridge.listPendingRuns().then((result) => {
      if (!current) return;
      if (result.ok) setPendingRuns(result.value);
      else setFailure(result.error);
    });
    return () => {
      current = false;
    };
  }, [bridge]);

  useEffect(() => {
    if (bridge?.saveSettings === undefined || !restored) return;
    // A value that is half typed is not kept: the last valid options stay saved until it is fixed.
    if (validateMangapressSettings(settings, format).length > 0) return;
    const command = settingsToKeep({
      mode,
      format,
      settings,
      singleBook,
      providerId: selectedProviderId,
      preferredNetworkInterface,
    });
    const key = JSON.stringify(command);
    if (key === lastKept.current) return;
    lastKept.current = key;
    // A failed save is tried again with the next change, whatever it is.
    const failedToSave = (message: string): void => {
      lastKept.current = undefined;
      notify(message);
    };
    void bridge.saveSettings(command).then(
      (result) => {
        if (!result.ok) failedToSave(result.error.message);
      },
      () => {
        failedToSave('The settings could not be saved.');
      },
    );
  }, [
    bridge,
    restored,
    mode,
    format,
    settings,
    singleBook,
    selectedProviderId,
    preferredNetworkInterface,
    notify,
  ]);

  useEffect(() => {
    if (bridge?.onConversionProgress === undefined) return;
    return bridge.onConversionProgress((update) => {
      if (update.jobId === jobId) setProgress(update);
    });
  }, [bridge, jobId]);

  useEffect(() => {
    if (bridge?.listNetworkInterfaces === undefined || bridge.getSharingStatus === undefined) {
      return;
    }
    let current = true;
    void Promise.all([bridge.listNetworkInterfaces(), bridge.getSharingStatus()]).then(
      ([interfacesResult, statusResult]) => {
        if (!current) return;
        if (interfacesResult.ok) setInterfaces(interfacesResult.value);
        if (statusResult.ok) setSharingStatus(statusResult.value);
      },
    );
    return () => {
      current = false;
    };
  }, [bridge]);

  useEffect(() => {
    if (bridge?.listMetadataProviders === undefined) return;
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
    if (bridge === undefined) return;
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
    if (bridge === undefined) return;
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
    if (bridge === undefined) return;
    setFailure(undefined);
    const result = await bridge.chooseInputs(kind);
    if (!result.ok) setFailure(result.error);
    else addRegistered(result.value);
  };

  const addDropped = async (files: readonly File[]): Promise<void> => {
    if (bridge === undefined) return;
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
    if (bridge === undefined) return;
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
    if (bridge === undefined) return;
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
    setStep('running');
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
        if (!ran.ok) {
          settled.push({
            rowId: row.id,
            name: row.displayName,
            status: 'failed',
            artifacts: [],
            message: ran.error.message,
          });
          if (ran.error.code === 'cancelled') cancelRequested.current = true;
          continue;
        }
        // One outcome for each title, so a book produced and one that failed are told apart.
        for (const title of ran.value) {
          settled.push({
            rowId: row.id,
            name: `${row.displayName} · ${title.title}`,
            status: title.status,
            artifacts: title.artifacts,
            ...(title.failure === undefined ? {} : { message: title.failure.message }),
          });
          if (title.failure?.code === 'cancelled') cancelRequested.current = true;
        }
        completedTitles.set(
          row.id,
          new Set(ran.value.filter((title) => title.status === 'done').map((title) => title.title)),
        );
        dispatch({
          type: 'library-results',
          id: row.id,
          results: ran.value.map((title) => ({ title: title.title, outcome: outcomeOf(title) })),
        });
        continue;
      }
      const result = await bridge.convert(commandFor(row, rowProcess, runId, nextJobId));
      if (result.ok) {
        settled.push({
          rowId: row.id,
          name: row.displayName,
          status: 'done',
          artifacts: result.value,
        });
      } else {
        settled.push({
          rowId: row.id,
          name: row.displayName,
          status: 'failed',
          artifacts: [],
          message: result.error.message,
        });
        if (result.error.code === 'cancelled') cancelRequested.current = true;
      }
    }
    setJobId(undefined);
    setProgress(undefined);
    setRunPosition(undefined);
    // Everything that was left out is reported with the reason and, when it can be fixed, a way to.
    for (const row of rows) {
      if (row.state === 'inspecting') continue;
      if (row.state === 'inspected' && row.kind === 'library' && attempted.has(row.id)) {
        // A library that ran can still have titles that wait for volumes.
        const waiting = (row.titles ?? []).filter(isWaitingTitle).length;
        if (waiting > 0) {
          settled.push({
            rowId: row.id,
            name: row.displayName,
            status: 'skipped',
            artifacts: [],
            message: `${plural(waiting, 'title')} left out until they have volumes.`,
            fixable: true,
          });
        }
        continue;
      }
      if (attempted.has(row.id)) continue;
      const view = describeRow(row, mode);
      if (view.runnable) continue;
      settled.push({
        rowId: row.id,
        name: row.displayName,
        status: 'skipped',
        artifacts: [],
        message: view.note ?? view.chip,
        fixable: row.state === 'inspected' && row.kind !== 'cbz' && mode !== 'convert-only',
      });
    }
    // Successfully processed inputs leave the queue. The rest stays so it can be fixed and retried.
    removeRows(
      rows
        .filter((row) => {
          if (row.state !== 'inspected') return false;
          if (row.kind === 'library') {
            const completed = completedTitles.get(row.id);
            return (
              completed !== undefined &&
              (row.titles ?? []).every(
                (title) => title.outcome?.status === 'done' || completed.has(title.title),
              )
            );
          }
          return settled.some((outcome) => outcome.rowId === row.id && outcome.status === 'done');
        })
        .map((row) => row.id),
    );
    if (settled.length === 0) {
      setStep('queue');
      return;
    }
    setOutcomes(settled);
    setResultSummary(
      mode === 'bind-only' ? 'Joined volumes · CBZ' : `${deviceName} · ${format.toUpperCase()}`,
    );
    const refreshed = await bridge.listPendingRuns();
    if (refreshed.ok) setPendingRuns(refreshed.value);
    else setFailure(refreshed.error);
    setStep('results');
  };

  const cancelConversion = async (): Promise<void> => {
    if (bridge === undefined || jobId === undefined) return;
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
    setEditingId(rowId);
    setStep('details');
  };

  const openTitleDetails = (row: InspectedRow, title: string): void => {
    keptOnOpen.current = persistableDetails(
      row.titles?.find((candidate) => candidate.title === title)?.details ?? noBookDetails,
    );
    setEditingTitle(title);
    setStep('details-title');
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
    if (JSON.stringify(kept) === JSON.stringify(keptOnOpen.current) || bridge === undefined) return;
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
    setEditingId(rowId);
    setStep(rows.find((row) => row.id === rowId)?.kind === 'library' ? 'library' : 'editing');
  };

  const confirmTitleMapping = async (
    row: InspectedRow,
    title: string,
    draft: MappingDraft,
  ): Promise<void> => {
    if (bridge === undefined) return;
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
    setStep('library');
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
    if (bridge === undefined) return [];
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
    if (bridge === undefined) return { volumes: [] };
    const result = await bridge.suggestVolumes(crypto.randomUUID(), providerId, workId, language);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };

  const openProviderHomepage = (providerId: string): void => {
    if (bridge === undefined) return;
    void bridge.openProviderHomepage(providerId).then((result) => {
      if (!result.ok) setFailure(result.error);
    });
  };

  const chooseSharedLibrary = async (): Promise<void> => {
    if (bridge === undefined) return;
    const result = await bridge.chooseLibrary();
    if (!result.ok) setFailure(result.error);
    else if (result.value !== null) setSharedLibrary(result.value);
  };

  const startSharing = async (interfaceAddress: string, auth: OpdsAuthConfig): Promise<void> => {
    if (bridge === undefined || sharedLibrary === undefined) return;
    const result = await bridge.startSharing(sharedLibrary.libraryId, interfaceAddress, auth);
    if (!result.ok) setFailure(result.error);
    else setSharingStatus(result.value);
  };

  /**
   * Opens the Share panel from the results screen with the books just saved chosen. Sharing that is
   * already on keeps serving what it serves: changing it is what Stop sharing is for.
   */
  const shareSavedBooks = (saved: SelectedLibrary): void => {
    if (!sharingStatus.active) setSharedLibrary(saved);
    setSharePanelOpen(true);
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
    setStep('results');
  };

  const refreshPendingRuns = async (): Promise<void> => {
    if (bridge === undefined) return;
    const result = await bridge.listPendingRuns();
    if (result.ok) setPendingRuns(result.value);
    else setFailure(result.error);
  };

  const discardPendingRun = async (libraryId: string): Promise<boolean> => {
    if (bridge === undefined) return false;
    setFailure(undefined);
    let result: Awaited<ReturnType<MangaboundBridge['discardPendingRun']>>;
    try {
      result = await bridge.discardPendingRun(libraryId);
    } catch {
      setFailure({
        code: 'pending_delete_failed',
        message: 'Mangabound could not delete these pending books. Please try again.',
      });
      return false;
    }
    if (!result.ok) {
      setFailure(result.error);
      return false;
    }
    setPendingRuns((current) => current.filter((run) => run.libraryId !== libraryId));
    if (sharedLibrary?.libraryId === libraryId) setSharedLibrary(undefined);
    if (activeRunId === libraryId) setActiveRunId(undefined);
    return true;
  };

  const saveArtifactAs = async (artifactId: string): Promise<void> => {
    if (bridge === undefined) return;
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
    if (bridge === undefined) return;
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

  const stopSharing = async (): Promise<void> => {
    if (bridge === undefined) return;
    const result = await bridge.stopSharing();
    if (!result.ok) setFailure(result.error);
    else setSharingStatus({ active: false });
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
  const selectedNetworkInterface = resolveNetworkInterface(interfaces, preferredNetworkInterface);
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

  const editingRow = rows.find((row) => row.id === editingId);
  // A library's titles can have their own details only where mangapress makes their books.
  const libraryProcess = rowMode('library', mode);
  const libraryMakesBooks = libraryProcess !== 'skip' && usesMangapress(libraryProcess);
  const editingTitleEntry =
    editingRow?.state === 'inspected'
      ? editingRow.titles?.find((title) => title.title === editingTitle)
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
      <Titlebar
        desktop={bridge !== undefined}
        platform={bridge?.runtime.platform}
        version={bridge?.runtime.version}
      >
        {bridge !== undefined && (
          <ShareMenu
            onOpenChange={setSharePanelOpen}
            open={sharePanelOpen}
            sharing={sharingStatus.active}
          >
            <SharePanel
              interfaces={interfaces}
              selectedInterface={selectedNetworkInterface}
              library={sharedLibrary}
              onChooseLibrary={() => {
                void chooseSharedLibrary();
              }}
              onStart={(interfaceAddress, auth) => {
                void startSharing(interfaceAddress, auth);
              }}
              onSelectInterface={setPreferredNetworkInterface}
              onStop={() => {
                void stopSharing();
              }}
              status={sharingStatus}
            />
          </ShareMenu>
        )}
      </Titlebar>
      {/* The line under the bar is this area's top edge: see Titlebar for why it is not the bar's. */}
      <div className="border-border min-h-0 flex-1 overflow-y-auto border-t">
        {bridge === undefined ? (
          <Foundation toolchain={toolchain} />
        ) : (
          <main className="mx-auto max-w-6xl px-8 py-10">
            <ToolchainBanner toolchain={toolchain} />
            <Notices
              notices={notices}
              onDismiss={() => {
                setNotices([]);
              }}
            />
            {failure !== undefined && <IssueCallout failure={failure} />}
            {step === 'queue' && (
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
                  setStep('options');
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
            {step === 'options' && (
              <section className="mx-auto max-w-5xl space-y-6" aria-labelledby="options-title">
                <Button
                  onClick={() => {
                    setStep('queue');
                  }}
                  variant="ghost"
                >
                  <ArrowLeft /> Back
                </Button>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-muted-foreground text-xs font-medium">Advanced</p>
                    <h1
                      className="focus-visible:ring-ring focus-visible:ring-offset-background mt-2 rounded-md text-3xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      id="options-title"
                      ref={optionsTitleRef}
                      tabIndex={-1}
                    >
                      Conversion options
                    </h1>
                    <p className="text-muted-foreground mt-3 text-sm">
                      Fine-tune page layout, images, metadata, and output for everything in the
                      queue. Your choices are saved for next time.
                    </p>
                  </div>
                  <div className="w-72 shrink-0">
                    <ResetOptions
                      changed={!isDefaultMangapress(format, settings)}
                      onReset={resetMangapress}
                      scope="the device, format and every mangapress option"
                    />
                  </div>
                </div>
                <MangapressSettingsEditor
                  format={format}
                  onFormat={handleFormat}
                  onNotify={notify}
                  onSettings={setSettings}
                  profiles={profiles}
                  settings={settings}
                  singleBook={singleBookActive}
                />
              </section>
            )}
            {step === 'editing' &&
              editingRow?.state === 'inspected' &&
              editingRow.mapping !== undefined && (
                <div className="space-y-4">
                  <Button
                    onClick={() => {
                      setStep('queue');
                    }}
                    variant="ghost"
                  >
                    <ChevronLeft /> Queue
                  </Button>
                  <MappingEditor
                    initialDraft={editingRow.mapping}
                    onConfirm={(_metadata, draft) => {
                      dispatch({ type: 'confirm-mapping', id: editingRow.id, mapping: draft });
                      setStep('queue');
                    }}
                    onSkipGrouping={() => {
                      setMode('convert-only');
                      setStep('queue');
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
            {step === 'library' &&
              editingRow?.state === 'inspected' &&
              editingRow.titles !== undefined && (
                <LibraryScreen
                  name={editingRow.displayName}
                  onBack={() => {
                    setStep('queue');
                  }}
                  onEdit={(title) => {
                    setEditingTitle(title);
                    setStep('editing-title');
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
            {step === 'editing-title' &&
              editingRow?.state === 'inspected' &&
              editingTitleEntry !== undefined && (
                <div className="space-y-4">
                  <Button
                    onClick={() => {
                      setStep('library');
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
                    startedFrom={
                      editingTitleEntry.draft.volumes.length > 0 ? 'mangabind' : undefined
                    }
                  />
                </div>
              )}
            {step === 'details' &&
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
                    setStep('queue');
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
            {step === 'details-title' &&
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
                    setStep('library');
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
            {step === 'running' && (
              <RunningScreen
                onCancel={() => {
                  void cancelConversion();
                }}
                {...(progress === undefined ? {} : { progress })}
                {...(runPosition === undefined ? {} : { position: runPosition })}
              />
            )}
            {step === 'results' && (
              <ResultsScreen
                aside={
                  outcomes.some((outcome) => outcome.artifacts.length > 0) &&
                  activeRunId !== undefined ? (
                    <SendToKoreader
                      onOpen={() => {
                        shareSavedBooks({
                          libraryId: activeRunId,
                          displayPath: 'Books ready to share',
                        });
                      }}
                      status={sharingStatus}
                    />
                  ) : undefined
                }
                onBack={() => {
                  setOutcomes([]);
                  setStep('queue');
                }}
                onFix={(rowId) => {
                  setOutcomes([]);
                  openEditor(rowId);
                }}
                onOpen={(artifactId) => {
                  if (bridge.openArtifact !== undefined) {
                    void runArtifactAction(bridge.openArtifact, artifactId);
                  }
                }}
                onShow={(artifactId) => {
                  if (bridge.showArtifactInFolder !== undefined) {
                    void runArtifactAction(bridge.showArtifactInFolder, artifactId);
                  }
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
        )}
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

function Foundation({ toolchain }: { readonly toolchain?: ToolchainStatus }): React.JSX.Element {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-8 py-16">
      <section className="max-w-2xl space-y-4" aria-labelledby="foundation-title">
        <p className="text-muted-foreground text-xs font-medium">Architecture checkpoint</p>
        <h1 id="foundation-title" className="text-4xl font-semibold tracking-tight">
          A deliberate foundation for the manga pipeline.
        </h1>
        <p className="text-muted-foreground text-base leading-7">
          The desktop shell, design tokens, security boundaries, and test harnesses are in place.
          Release-pinned conversion tools are checked before any job can run.
        </p>
      </section>
      <ToolchainBanner toolchain={toolchain} />
      <section className="grid gap-4 md:grid-cols-3" aria-label="Foundation boundaries">
        {foundations.map(({ description, icon: Icon, title }) => (
          <article key={title} className="border-border bg-surface rounded-xl border p-5">
            <Icon aria-hidden="true" className="text-accent mb-5 size-5" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-muted-foreground mt-2 text-sm leading-6">{description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
