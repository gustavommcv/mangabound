import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  CircleAlert,
  FileArchive,
  FolderOpen,
  Library,
  LoaderCircle,
  MonitorSmartphone,
  RadioTower,
  RotateCcw,
  Square,
} from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';

import {
  applyCorrectedMapping,
  applyTitleResult,
  createBatchState,
  retryTitle,
  startConversion as markTitlesConverting,
  type BatchState,
  type BatchTitle,
  type BatchTitleStatus,
} from '@/domain/batch';
import type { BookFormat, ConversionProgress } from '@/domain/conversion';
import {
  describeRow,
  emptyQueue,
  type InspectedRow,
  type QueueInput,
  queueReducer,
  runnableRows,
  sessionIds,
} from '@/domain/input-queue';
import { type MappingDraft, mappingSignature } from '@/domain/mapping';
import {
  defaultMangapressSettings,
  type MangapressSettings,
  validateMangapressSettings,
  withDeviceProfile,
} from '@/domain/output-profile';
import {
  type BatchProcessMode,
  defaultProcessMode,
  type ProcessMode,
  resolveMode,
  usesMangapress,
} from '@/domain/process-mode';
import { MappingEditor } from '@/renderer/components/mapping/mapping-editor';
import { MangapressSettingsEditor } from '@/renderer/components/settings/mangapress-settings';
import { ProcessSteps } from '@/renderer/components/settings/process-steps';
import { KoreaderCard } from '@/renderer/components/sharing/koreader-card';
import { SharePanel } from '@/renderer/components/sharing/share-panel';
import { Button } from '@/renderer/components/ui/button';
import { Label } from '@/renderer/components/ui/label';
import { QueueScreen, type RowPlan } from '@/renderer/screens/queue-screen';
import { ResultsScreen, type RunOutcome } from '@/renderer/screens/results-screen';
import { RunningScreen } from '@/renderer/screens/running-screen';
import type {
  NetworkInterfaceOption,
  OpdsAuthConfig,
  OpdsSharingStatus,
} from '@/shared/opds-contract';
import type { ToolchainStatus } from '@/shared/toolchain-status';
import type {
  ConversionCommand,
  DeviceProfileSummary,
  MetadataProviderDescriptor,
  MetadataSearchResult,
  RegisteredInputs,
  SelectedInput,
  SelectedLibrary,
  VolumeSuggestion,
  WorkflowFailure,
} from '@/shared/workflow-contract';

type WorkflowStep =
  'queue' | 'editing' | 'options' | 'running' | 'results' | 'inspecting' | 'batch-review';

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
  const [library, setLibrary] = useState<SelectedLibrary>();
  const [settings, setSettings] = useState<MangapressSettings>(defaultMangapressSettings);
  const [format, setFormat] = useState<BookFormat>('epub');
  const [mode, setMode] = useState<ProcessMode>(defaultProcessMode);
  const [jobId, setJobId] = useState<string>();
  const [progress, setProgress] = useState<ConversionProgress>();
  const [runPosition, setRunPosition] = useState<{
    readonly name: string;
    readonly index: number;
    readonly total: number;
  }>();
  const [outcomes, setOutcomes] = useState<readonly RunOutcome[]>([]);
  const [validated, setValidated] = useState<{
    readonly key: string;
    readonly plans: readonly RowPlan[];
  }>();
  const [validating, setValidating] = useState(false);
  const [failure, setFailure] = useState<WorkflowFailure>();
  const [batchParent, setBatchParent] = useState<{
    readonly parentPath: string;
    readonly displayName: string;
  }>();
  const [batch, setBatch] = useState<BatchState>();
  const [correctingTitle, setCorrectingTitle] = useState<string>();
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [sharedLibrary, setSharedLibrary] = useState<SelectedLibrary>();
  const [interfaces, setInterfaces] = useState<readonly NetworkInterfaceOption[]>([]);
  const [sharingStatus, setSharingStatus] = useState<OpdsSharingStatus>({ active: false });
  const [metadataProviders, setMetadataProviders] = useState<readonly MetadataProviderDescriptor[]>(
    [],
  );
  const rowsRef = useRef(rows);
  const attemptedInspection = useRef(new Set<string>());
  const cancelRequested = useRef(false);

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
        if (result.ok) {
          setProfiles(result.value);
          if (
            !result.value.some(
              (candidate) => candidate.code === defaultMangapressSettings.deviceProfile,
            )
          ) {
            setSettings((current) => withDeviceProfile(current, result.value[0]?.code ?? ''));
          }
        } else {
          setFailure(result.error);
        }
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
          ...(result.value.mapping === undefined ? {} : { mapping: result.value.mapping }),
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

  const chooseLibrary = async (): Promise<void> => {
    if (bridge === undefined) return;
    const result = await bridge.chooseLibrary();
    if (!result.ok) setFailure(result.error);
    else if (result.value !== null) setLibrary(result.value);
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
  const batchRunOptions = (): ReturnType<typeof withRunSettings<BatchProcessMode>> =>
    withRunSettings(resolveMode('library', mode));
  /** The command for one queue row. A folder sent straight to mangapress carries no volumes. */
  const commandFor = (
    row: InspectedRow,
    rowProcess: ProcessMode,
    libraryId: string,
    commandJobId: string,
  ): ConversionCommand => ({
    jobId: commandJobId,
    sessionId: row.sessionId,
    libraryId,
    ...withRunSettings(rowProcess),
    ...(row.mapping === undefined || rowProcess === 'convert-only' ? {} : { mapping: row.mapping }),
  });

  // A validated plan only describes the queue, process and settings it was made for.
  const planKey = JSON.stringify([
    mode,
    format,
    settings,
    library?.libraryId,
    rows.map((row) => [
      row.id,
      row.state,
      row.state === 'inspected' && row.mapping !== undefined ? mappingSignature(row.mapping) : '',
      row.state === 'inspected' ? row.confirmed : false,
    ]),
  ]);
  const plans = validated?.key === planKey ? validated.plans : undefined;

  const validatePlans = async (): Promise<void> => {
    if (bridge === undefined || library === undefined) return;
    setFailure(undefined);
    setValidating(true);
    const collected: RowPlan[] = [];
    try {
      for (const { row, mode: rowProcess } of runnableRows(rows, mode)) {
        const result = await bridge.planConversion(
          commandFor(row, rowProcess, library.libraryId, crypto.randomUUID()),
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
    if (bridge === undefined || library === undefined) return;
    const items = runnableRows(rows, mode);
    if (items.length === 0) return;
    setFailure(undefined);
    cancelRequested.current = false;
    setStep('running');
    const settled: RunOutcome[] = [];
    for (const [index, { row, mode: rowProcess }] of items.entries()) {
      if (cancelRequested.current) break;
      const nextJobId = crypto.randomUUID();
      setJobId(nextJobId);
      setRunPosition({ name: row.displayName, index: index + 1, total: items.length });
      setProgress({ stage: 'processing', message: 'Preparing…' });
      const result = await bridge.convert(
        commandFor(row, rowProcess, library.libraryId, nextJobId),
      );
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
    const ranIds = new Set(settled.map((outcome) => outcome.rowId));
    for (const row of rows) {
      if (ranIds.has(row.id) || row.state === 'inspecting') continue;
      const view = describeRow(row, mode);
      if (view.runnable) continue;
      settled.push({
        rowId: row.id,
        name: row.displayName,
        status: 'skipped',
        artifacts: [],
        message: view.note ?? view.chip,
        fixable: row.state === 'inspected' && row.kind === 'folder' && mode !== 'convert-only',
      });
    }
    // Books that were saved leave the queue; the rest stay so they can be fixed and run again.
    removeRows(
      settled.filter((outcome) => outcome.status === 'done').map((outcome) => outcome.rowId),
    );
    if (settled.length === 0) {
      setStep('queue');
      return;
    }
    setOutcomes(settled);
    setStep('results');
  };

  const cancelConversion = async (): Promise<void> => {
    if (bridge === undefined || jobId === undefined) return;
    cancelRequested.current = true;
    const result = await bridge.cancelConversion(jobId);
    if (!result.ok) setFailure(result.error);
  };

  const openEditor = (rowId: string): void => {
    setEditingId(rowId);
    setStep('editing');
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

  const loadBatchPlan = async (parentPath: string): Promise<void> => {
    if (bridge === undefined) return;
    setFailure(undefined);
    setStep('inspecting');
    const result = await bridge.planBatch(crypto.randomUUID(), parentPath);
    if (!result.ok) {
      setFailure(result.error);
      setStep(batch === undefined ? 'queue' : 'batch-review');
      return;
    }
    setBatch(createBatchState(result.value));
    setStep('batch-review');
  };

  const chooseBatch = async (): Promise<void> => {
    if (bridge === undefined) return;
    setFailure(undefined);
    const chosen = await bridge.chooseInputBatch();
    if (!chosen.ok) {
      setFailure(chosen.error);
      return;
    }
    if (chosen.value === null) return;
    setBatchParent(chosen.value);
    await loadBatchPlan(chosen.value.parentPath);
  };

  const confirmTitleMapping = async (title: string, draft: MappingDraft): Promise<void> => {
    if (bridge === undefined) return;
    const current = batch?.titles.find((candidate) => candidate.title === title);
    if (current === undefined) return;
    setFailure(undefined);
    const result = await bridge.writeTitleMapping(current.inputPath, draft);
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    setBatch((state) => (state === undefined ? state : applyCorrectedMapping(state, title, draft)));
    setCorrectingTitle(undefined);
    if (batchParent !== undefined) await loadBatchPlan(batchParent.parentPath);
  };

  const startBatchConversion = async (): Promise<void> => {
    if (
      bridge === undefined ||
      batchParent === undefined ||
      library === undefined ||
      batch === undefined
    ) {
      return;
    }
    const nextJobId = crypto.randomUUID();
    setJobId(nextJobId);
    setFailure(undefined);
    setProgress({ stage: 'processing', message: 'Preparing batch conversion…' });
    setBatch(markTitlesConverting(batch));
    const result = await bridge.convertBatch({
      jobId: nextJobId,
      parentPath: batchParent.parentPath,
      libraryId: library.libraryId,
      ...batchRunOptions(),
    });
    setJobId(undefined);
    setProgress(undefined);
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    setBatch((state) => {
      if (state === undefined) return state;
      let next = state;
      for (const outcome of result.value) next = applyTitleResult(next, outcome);
      return next;
    });
  };

  const retryBatchTitle = async (title: string): Promise<void> => {
    if (
      bridge === undefined ||
      batchParent === undefined ||
      library === undefined ||
      batch === undefined
    ) {
      return;
    }
    const nextJobId = crypto.randomUUID();
    setJobId(nextJobId);
    setFailure(undefined);
    setProgress({ stage: 'processing', message: `Retrying ${title}…` });
    setBatch(markTitlesConverting(retryTitle(batch, title), [title]));
    const result = await bridge.convertBatch({
      jobId: nextJobId,
      parentPath: batchParent.parentPath,
      libraryId: library.libraryId,
      ...batchRunOptions(),
      titles: [title],
    });
    setJobId(undefined);
    setProgress(undefined);
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    setBatch((state) => {
      if (state === undefined) return state;
      let next = state;
      for (const outcome of result.value) next = applyTitleResult(next, outcome);
      return next;
    });
  };

  const startOverBatch = (): void => {
    setBatchParent(undefined);
    setBatch(undefined);
    setCorrectingTitle(undefined);
    setFailure(undefined);
    setProgress(undefined);
    setJobId(undefined);
    setStep('queue');
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
  ): Promise<{ readonly volumes: readonly VolumeSuggestion[] }> => {
    if (bridge === undefined) return { volumes: [] };
    const result = await bridge.suggestVolumes(crypto.randomUUID(), providerId, workId);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };

  const chooseSharedLibrary = async (): Promise<void> => {
    if (bridge === undefined) return;
    const result = await bridge.chooseLibrary();
    if (!result.ok) setFailure(result.error);
    else if (result.value !== null) setSharedLibrary(result.value);
  };

  const startSharing = async (
    interfaceAddress: string,
    auth: OpdsAuthConfig,
    target: SelectedLibrary | undefined = sharedLibrary,
  ): Promise<void> => {
    if (bridge === undefined || target === undefined) return;
    const result = await bridge.startSharing(target.libraryId, interfaceAddress, auth);
    if (!result.ok) setFailure(result.error);
    else setSharingStatus(result.value);
  };

  const stopSharing = async (): Promise<void> => {
    if (bridge === undefined) return;
    const result = await bridge.stopSharing();
    if (!result.ok) setFailure(result.error);
    else setSharingStatus({ active: false });
  };

  const correctingDraft: MappingDraft | undefined =
    correctingTitle === undefined
      ? undefined
      : (batch?.titles.find((title) => title.title === correctingTitle)?.draft ?? {
          mangaTitle: correctingTitle,
          chapters: [],
          volumes: [],
        });

  const editingRow = rows.find((row) => row.id === editingId);
  const deviceName =
    profiles.find((profile) => profile.code === settings.deviceProfile)?.name ??
    settings.deviceProfile;

  return (
    <div className="bg-background text-foreground min-h-screen">
      <Titlebar runtime={bridge?.runtime} />
      {bridge === undefined ? (
        <Foundation toolchain={toolchain} />
      ) : (
        <main className="mx-auto max-w-6xl px-8 py-10">
          <ToolchainBanner toolchain={toolchain} />
          <div className="mb-8 space-y-3">
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setSharePanelOpen((open) => !open);
                }}
                size="sm"
                variant="outline"
              >
                <RadioTower /> {sharingStatus.active ? 'Sharing active' : 'Share'}
              </Button>
            </div>
            {sharePanelOpen && (
              <SharePanel
                interfaces={interfaces}
                library={sharedLibrary}
                onChooseLibrary={() => {
                  void chooseSharedLibrary();
                }}
                onStart={(interfaceAddress, auth) => {
                  void startSharing(interfaceAddress, auth);
                }}
                onStop={() => {
                  void stopSharing();
                }}
                status={sharingStatus}
              />
            )}
          </div>
          {failure !== undefined && <IssueCallout failure={failure} />}
          {step === 'queue' && (
            <QueueScreen
              disabled={toolchain?.state !== 'ready'}
              format={format}
              {...(library === undefined ? {} : { library })}
              mode={mode}
              onAddFiles={() => {
                void addFromDialog('files');
              }}
              onAddFolders={() => {
                void addFromDialog('folders');
              }}
              onAddLibrary={() => {
                void chooseBatch();
              }}
              onChooseLibrary={() => {
                void chooseLibrary();
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
              onFormat={setFormat}
              onMode={setMode}
              onOpenOptions={() => {
                setStep('options');
              }}
              onRemove={(id) => {
                removeRows([id]);
              }}
              onValidate={() => {
                void validatePlans();
              }}
              {...(plans === undefined ? {} : { plans })}
              profiles={profiles}
              rejected={rejected}
              rows={rows}
              settings={settings}
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
              <div>
                <p className="text-muted-foreground text-xs font-medium">Advanced</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight" id="options-title">
                  mangapress options
                </h1>
                <p className="text-muted-foreground mt-3 text-sm">
                  Every setting mangapress supports. They apply to everything in the queue.
                </p>
              </div>
              <MangapressSettingsEditor
                format={format}
                onFormat={setFormat}
                onSettings={setSettings}
                profiles={profiles}
                settings={settings}
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
                  metadataProviders={metadataProviders}
                  onConfirm={(_metadata, draft) => {
                    dispatch({ type: 'confirm-mapping', id: editingRow.id, mapping: draft });
                    setStep('queue');
                  }}
                  onSearchMetadata={searchMetadata}
                  onSkipGrouping={() => {
                    setMode('convert-only');
                    setStep('queue');
                  }}
                  onSuggestVolumes={suggestVolumes}
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
                library !== undefined ? (
                  <KoreaderCard
                    interfaces={interfaces}
                    onStart={(interfaceAddress) => {
                      setSharedLibrary(library);
                      void startSharing(interfaceAddress, { mode: 'token' }, library);
                    }}
                    onStop={() => {
                      void stopSharing();
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
              outcomes={outcomes}
              summary={
                mode === 'bind-only'
                  ? `Joined volumes · CBZ · ${library?.displayPath ?? ''}`
                  : `${deviceName} · ${format.toUpperCase()} · ${library?.displayPath ?? ''}`
              }
            />
          )}
          {step === 'inspecting' && <Inspecting />}
          {step === 'batch-review' && batch !== undefined && correctingTitle === undefined && (
            <BatchReview
              batch={batch}
              displayName={batchParent?.displayName ?? 'this library'}
              format={format}
              library={library}
              mode={mode}
              onMode={setMode}
              onCancel={() => {
                void cancelConversion();
              }}
              onChooseLibrary={() => {
                void chooseLibrary();
              }}
              onFixMapping={setCorrectingTitle}
              onFormat={setFormat}
              onRetry={(title) => {
                void retryBatchTitle(title);
              }}
              onSettings={setSettings}
              onStart={() => {
                void startBatchConversion();
              }}
              onStartOver={startOverBatch}
              profiles={profiles}
              progress={progress}
              running={jobId !== undefined}
              settings={settings}
            />
          )}
          {step === 'batch-review' &&
            batch !== undefined &&
            correctingTitle !== undefined &&
            correctingDraft !== undefined && (
              <MappingEditor
                initialDraft={correctingDraft}
                startedFrom={correctingDraft.volumes.length > 0 ? 'mangabind' : undefined}
                onConfirm={(_metadata, draft) => {
                  void confirmTitleMapping(correctingTitle, draft);
                }}
                metadataProviders={metadataProviders}
                onSearchMetadata={searchMetadata}
                onSuggestVolumes={suggestVolumes}
              />
            )}
        </main>
      )}
    </div>
  );
}

function Titlebar({
  runtime,
}: {
  readonly runtime?: { readonly platform: string };
}): React.JSX.Element {
  return (
    <header className="window-titlebar border-border bg-titlebar border-b">
      <div className="window-titlebar-content flex items-center gap-3 px-4">
        <span aria-hidden="true" className="bg-accent size-2 rounded-full" />
        <span className="text-sm font-semibold tracking-tight">Mangabound</span>
        <span className="text-muted-foreground text-xs">
          {runtime === undefined ? 'Foundation' : 'Desktop'}
        </span>
      </div>
    </header>
  );
}

function ToolchainBanner({
  toolchain,
}: {
  readonly toolchain?: ToolchainStatus;
}): React.JSX.Element {
  return (
    <section
      aria-label="Bundled tool status"
      className="border-border bg-surface mb-8 flex items-start gap-3 rounded-lg border px-4 py-3"
    >
      {toolchain === undefined ? (
        <LoaderCircle aria-hidden="true" className="text-accent mt-0.5 size-4 animate-spin" />
      ) : toolchain.state === 'ready' ? (
        <CheckCircle2 aria-hidden="true" className="text-status-complete mt-0.5 size-4" />
      ) : (
        <CircleAlert aria-hidden="true" className="text-status-warning mt-0.5 size-4" />
      )}
      <div>
        <h2 className="text-sm font-semibold">
          {toolchain === undefined
            ? 'Checking conversion tools'
            : toolchain.state === 'ready'
              ? 'Conversion tools ready'
              : 'Conversion tools need attention'}
        </h2>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {toolchain?.message ?? 'Checking versions, compatibility, and file integrity…'}
        </p>
      </div>
    </section>
  );
}

export function Inspecting({
  selection,
}: {
  readonly selection?: SelectedInput;
}): React.JSX.Element {
  return (
    <section
      className="flex min-h-80 flex-col items-center justify-center text-center"
      aria-live="polite"
    >
      <LoaderCircle aria-hidden="true" className="text-accent size-7 animate-spin" />
      <h1 className="mt-5 text-xl font-semibold">
        Inspecting {selection?.displayName ?? 'input'}…
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">Reading chapter names and page counts.</p>
    </section>
  );
}

export function OutputSettingsPanel({
  format,
  library,
  mangapressDisabled = false,
  onChooseLibrary,
  onFormat,
  onSettings,
  profiles,
  settings,
}: {
  readonly format: BookFormat;
  readonly library?: SelectedLibrary;
  /** True when mangapress will not run, so its settings stay visible but cannot be edited. */
  readonly mangapressDisabled?: boolean;
  readonly onChooseLibrary: () => void;
  readonly onFormat: (format: BookFormat) => void;
  readonly onSettings: (settings: MangapressSettings) => void;
  readonly profiles: readonly DeviceProfileSummary[];
  readonly settings: MangapressSettings;
}): React.JSX.Element {
  const editor = (
    <MangapressSettingsEditor
      format={format}
      onFormat={onFormat}
      onSettings={onSettings}
      profiles={profiles}
      settings={settings}
    />
  );
  return (
    <>
      {mangapressDisabled ? (
        <fieldset className="m-0 min-w-0 space-y-4 border-0 p-0" disabled>
          <legend className="text-muted-foreground mb-3 text-sm">
            mangapress is not run when you only join volumes, so these settings are not used.
          </legend>
          {editor}
        </fieldset>
      ) : (
        editor
      )}
      <div className="border-border bg-surface rounded-xl border p-6">
        <div className="space-y-3">
          <div>
            <Label>Output library</Label>
            <p className="text-muted-foreground mt-1 text-sm break-all">
              {library?.displayPath ?? 'No folder selected'}
            </p>
          </div>
          <Button onClick={onChooseLibrary} variant="outline">
            <FolderOpen /> {library === undefined ? 'Choose output folder' : 'Change output folder'}
          </Button>
        </div>
      </div>
    </>
  );
}

export function BatchReview({
  batch,
  displayName,
  format,
  library,
  mode = defaultProcessMode,
  onCancel,
  onChooseLibrary,
  onFixMapping,
  onFormat,
  onMode,
  onRetry,
  onSettings,
  onStart,
  onStartOver,
  profiles,
  progress,
  running,
  settings,
}: {
  readonly batch: BatchState;
  readonly displayName: string;
  readonly format: BookFormat;
  readonly library?: SelectedLibrary;
  readonly mode?: ProcessMode;
  readonly onCancel: () => void;
  readonly onChooseLibrary: () => void;
  readonly onFixMapping: (title: string) => void;
  readonly onFormat: (format: BookFormat) => void;
  readonly onMode?: (mode: ProcessMode) => void;
  readonly onRetry: (title: string) => void;
  readonly onSettings: (settings: MangapressSettings) => void;
  readonly onStart: () => void;
  readonly onStartOver: () => void;
  readonly profiles: readonly DeviceProfileSummary[];
  readonly progress?: ConversionProgress;
  readonly running: boolean;
  readonly settings: MangapressSettings;
}): React.JSX.Element {
  const resolved = resolveMode('library', mode);
  const runsMangapress = usesMangapress(resolved);
  const settingIssues = runsMangapress ? validateMangapressSettings(settings) : [];
  const doneCount = batch.titles.filter((title) => title.status === 'done').length;
  return (
    <section className="mx-auto max-w-5xl space-y-6" aria-labelledby="batch-title">
      <Button disabled={running} onClick={onStartOver} variant="ghost">
        <ArrowLeft /> Back
      </Button>
      <div>
        <p className="text-muted-foreground text-xs font-medium">Batch setup</p>
        <h1 id="batch-title" className="mt-2 text-3xl font-semibold tracking-tight">
          {resolved === 'bind-only' ? 'Join' : 'Convert'} {displayName}
        </h1>
        <p className="text-muted-foreground mt-3 text-sm">
          {String(batch.titles.length)} manga found · {String(doneCount)}{' '}
          {resolved === 'bind-only' ? 'joined' : 'converted'} so far
        </p>
      </div>
      {onMode !== undefined && (
        <div className="border-border bg-surface rounded-xl border p-6">
          <ProcessSteps disabled={running} input="library" mode={mode} onMode={onMode} />
        </div>
      )}
      {running && progress !== undefined && (
        <div aria-live="polite" className="border-border bg-surface rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <LoaderCircle aria-hidden="true" className="text-accent size-4 animate-spin" />
            <p className="text-sm">
              {progress.title !== undefined ? `${progress.title} · ` : ''}
              {progress.message}
            </p>
          </div>
        </div>
      )}
      <ul className="space-y-3">
        {batch.titles.map((title) => (
          <BatchTitleRow
            key={title.title}
            onFixMapping={() => {
              onFixMapping(title.title);
            }}
            onRetry={() => {
              onRetry(title.title);
            }}
            running={running}
            title={title}
          />
        ))}
      </ul>
      <OutputSettingsPanel
        format={format}
        library={library}
        mangapressDisabled={!runsMangapress}
        onChooseLibrary={onChooseLibrary}
        onFormat={onFormat}
        onSettings={onSettings}
        profiles={profiles}
        settings={settings}
      />
      {settingIssues.length > 0 && (
        <p className="text-status-failed text-sm" role="alert">
          Review the highlighted output settings before converting.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        {running ? (
          <Button onClick={onCancel} size="lg" variant="outline">
            <Square /> Cancel batch
          </Button>
        ) : (
          <Button
            disabled={library === undefined || settingIssues.length > 0}
            onClick={onStart}
            size="lg"
          >
            <MonitorSmartphone />{' '}
            {resolved === 'bind-only' ? 'Start batch join' : 'Start batch conversion'}
          </Button>
        )}
      </div>
    </section>
  );
}

function BatchTitleRow({
  onFixMapping,
  onRetry,
  running,
  title,
}: {
  readonly onFixMapping: () => void;
  readonly onRetry: () => void;
  readonly running: boolean;
  readonly title: BatchTitle;
}): React.JSX.Element {
  return (
    <li className="border-border bg-surface flex flex-wrap items-center gap-4 rounded-xl border p-5">
      <BatchStatusIcon status={title.status} />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold">{title.title}</h2>
        {title.status === 'needsMapping' ? (
          <p className="text-status-warning mt-1 text-xs">
            No volumes could be assigned automatically. Use "Fix mapping" or convert it individually
            from the manga folder flow.
          </p>
        ) : (
          <p className="text-muted-foreground mt-1 text-xs">
            {String(title.volumes.length)} volume{title.volumes.length === 1 ? '' : 's'}
            {title.artifacts === undefined ? '' : ` · ${String(title.artifacts.length)} saved`}
          </p>
        )}
        {title.failure !== undefined && (
          <p className="text-status-failed mt-1 text-xs">{title.failure.message}</p>
        )}
      </div>
      {title.status === 'needsMapping' && (
        <Button disabled={running} onClick={onFixMapping} size="sm" variant="outline">
          Fix mapping
        </Button>
      )}
      {title.status === 'failed' && (
        <Button disabled={running} onClick={onRetry} size="sm" variant="outline">
          <RotateCcw /> Retry
        </Button>
      )}
    </li>
  );
}

function BatchStatusIcon({ status }: { readonly status: BatchTitleStatus }): React.JSX.Element {
  switch (status) {
    case 'needsMapping':
      return <CircleAlert aria-hidden="true" className="text-status-warning size-5 shrink-0" />;
    case 'converting':
      return (
        <LoaderCircle aria-hidden="true" className="text-accent size-5 shrink-0 animate-spin" />
      );
    case 'done':
      return <CheckCircle2 aria-hidden="true" className="text-status-complete size-5 shrink-0" />;
    case 'failed':
      return <CircleAlert aria-hidden="true" className="text-status-failed size-5 shrink-0" />;
    case 'ready':
      return <FileArchive aria-hidden="true" className="text-muted-foreground size-5 shrink-0" />;
  }
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
