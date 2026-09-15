import {
  ArrowLeft,
  BookCheck,
  Boxes,
  CheckCircle2,
  CircleAlert,
  FileArchive,
  FolderOpen,
  Library,
  LoaderCircle,
  MonitorSmartphone,
  RadioTower,
  Square,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { BookFormat, ConversionProgress, InputKind } from '@/domain/conversion';
import type { MappingDraft } from '@/domain/mapping';
import {
  defaultMangapressSettings,
  type MangapressSettings,
  validateMangapressSettings,
} from '@/domain/output-profile';
import { MappingEditor } from '@/renderer/components/mapping/mapping-editor';
import { MangapressSettingsEditor } from '@/renderer/components/settings/mangapress-settings';
import { Button } from '@/renderer/components/ui/button';
import { Label } from '@/renderer/components/ui/label';
import type { ToolchainStatus } from '@/shared/toolchain-status';
import type {
  ArtifactSummary,
  DeviceProfileSummary,
  InspectedInputPayload,
  PlanSummary,
  SelectedInput,
  SelectedLibrary,
  WorkflowFailure,
} from '@/shared/workflow-contract';

type WorkflowStep = 'home' | 'inspecting' | 'mapping' | 'settings' | 'running' | 'complete';

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

export function App(): React.JSX.Element {
  const bridge = window.mangabound;
  const [toolchain, setToolchain] = useState<ToolchainStatus>();
  const [profiles, setProfiles] = useState<readonly DeviceProfileSummary[]>([]);
  const [step, setStep] = useState<WorkflowStep>('home');
  const [selection, setSelection] = useState<SelectedInput>();
  const [inspection, setInspection] = useState<InspectedInputPayload>();
  const [mapping, setMapping] = useState<MappingDraft>();
  const [library, setLibrary] = useState<SelectedLibrary>();
  const [settings, setSettings] = useState<MangapressSettings>(defaultMangapressSettings);
  const [format, setFormat] = useState<BookFormat>('epub');
  const [jobId, setJobId] = useState<string>();
  const [progress, setProgress] = useState<ConversionProgress>();
  const [artifacts, setArtifacts] = useState<readonly ArtifactSummary[]>([]);
  const [plan, setPlan] = useState<PlanSummary>();
  const [planning, setPlanning] = useState(false);
  const [failure, setFailure] = useState<WorkflowFailure>();
  const planTokenRef = useRef(0);

  const invalidatePlan = (): void => {
    planTokenRef.current += 1;
    setPlan(undefined);
  };

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
          if (!result.value.some((candidate) => candidate.code === 'KV')) {
            setSettings((current) => ({
              ...current,
              deviceProfile: result.value[0]?.code ?? '',
            }));
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

  const chooseInput = async (kind: InputKind): Promise<void> => {
    if (bridge === undefined) return;
    setFailure(undefined);
    const chosen = await bridge.chooseInput(kind);
    if (!chosen.ok) {
      setFailure(chosen.error);
      return;
    }
    if (chosen.value === null) return;
    setSelection(chosen.value);
    setStep('inspecting');
    const inspected = await bridge.inspectInput(chosen.value.selectionId);
    if (!inspected.ok) {
      setFailure(inspected.error);
      setStep('home');
      return;
    }
    setInspection(inspected.value);
    setMapping(inspected.value.mapping);
    setStep(inspected.value.kind === 'folder' ? 'mapping' : 'settings');
  };

  const chooseLibrary = async (): Promise<void> => {
    if (bridge === undefined) return;
    const result = await bridge.chooseLibrary();
    if (!result.ok) setFailure(result.error);
    else if (result.value !== null) {
      setLibrary(result.value);
      invalidatePlan();
    }
  };

  const validatePlan = async (): Promise<void> => {
    if (
      bridge === undefined ||
      bridge.planConversion === undefined ||
      inspection === undefined ||
      library === undefined
    ) {
      return;
    }
    setFailure(undefined);
    invalidatePlan();
    const token = planTokenRef.current;
    setPlanning(true);
    try {
      const result = await bridge.planConversion({
        jobId: crypto.randomUUID(),
        sessionId: inspection.sessionId,
        libraryId: library.libraryId,
        settings,
        format,
        ...(mapping === undefined ? {} : { mapping }),
      });
      if (!result.ok) setFailure(result.error);
      else if (planTokenRef.current === token) setPlan(result.value);
    } finally {
      setPlanning(false);
    }
  };

  const startConversion = async (): Promise<void> => {
    if (bridge === undefined || inspection === undefined || library === undefined) return;
    const nextJobId = crypto.randomUUID();
    setJobId(nextJobId);
    setFailure(undefined);
    setProgress({ stage: 'processing', message: 'Preparing conversion…' });
    setStep('running');
    const result = await bridge.convert({
      jobId: nextJobId,
      sessionId: inspection.sessionId,
      libraryId: library.libraryId,
      settings,
      format,
      ...(mapping === undefined ? {} : { mapping }),
    });
    if (!result.ok) {
      setFailure(result.error);
      setStep('settings');
      return;
    }
    setArtifacts(result.value);
    setStep('complete');
  };

  const cancelConversion = async (): Promise<void> => {
    if (bridge === undefined || jobId === undefined) return;
    const result = await bridge.cancelConversion(jobId);
    if (!result.ok) setFailure(result.error);
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

  const startOver = async (): Promise<void> => {
    const sessionId = inspection?.sessionId;
    setSelection(undefined);
    setInspection(undefined);
    setMapping(undefined);
    setArtifacts([]);
    setFailure(undefined);
    setProgress(undefined);
    invalidatePlan();
    setJobId(undefined);
    setStep('home');
    if (sessionId !== undefined && bridge?.releaseInput !== undefined) {
      const result = await bridge.releaseInput(sessionId);
      if (!result.ok) setFailure(result.error);
    }
  };

  return (
    <div className="bg-background text-foreground min-h-screen">
      <Titlebar runtime={bridge?.runtime} />
      {bridge === undefined ? (
        <Foundation toolchain={toolchain} />
      ) : (
        <main className="mx-auto max-w-6xl px-8 py-10">
          <ToolchainBanner toolchain={toolchain} />
          {failure !== undefined && <IssueCallout failure={failure} />}
          {step === 'home' && (
            <Home
              disabled={toolchain?.state !== 'ready'}
              onChoose={(kind) => {
                void chooseInput(kind);
              }}
            />
          )}
          {step === 'inspecting' && <Inspecting selection={selection} />}
          {step === 'mapping' && inspection?.mapping !== undefined && (
            <MappingEditor
              initialDraft={inspection.mapping}
              onConfirm={(_metadata, draft) => {
                setMapping(draft);
                invalidatePlan();
                setStep('settings');
              }}
            />
          )}
          {step === 'settings' && inspection !== undefined && (
            <ConversionSettings
              format={format}
              inspection={inspection}
              library={library}
              mapping={mapping}
              onBack={() => {
                if (inspection.kind === 'folder') setStep('mapping');
                else void startOver();
              }}
              onChooseLibrary={() => {
                void chooseLibrary();
              }}
              onFormat={(nextFormat) => {
                setFormat(nextFormat);
                invalidatePlan();
              }}
              onPlan={() => {
                void validatePlan();
              }}
              onSettings={(nextSettings) => {
                setSettings(nextSettings);
                invalidatePlan();
              }}
              onStart={() => {
                void startConversion();
              }}
              plan={plan}
              planning={planning}
              settings={settings}
              profiles={profiles}
            />
          )}
          {step === 'running' && (
            <Running
              progress={progress}
              selection={selection}
              onCancel={() => {
                void cancelConversion();
              }}
            />
          )}
          {step === 'complete' && (
            <Complete
              artifacts={artifacts}
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
              onStartOver={() => {
                void startOver();
              }}
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
        <span aria-hidden="true" className="bg-accent shadow-status size-2 rounded-full" />
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

export function Home({
  disabled,
  onChoose,
}: {
  readonly disabled: boolean;
  readonly onChoose: (kind: InputKind) => void;
}): React.JSX.Element {
  return (
    <section className="space-y-8" aria-labelledby="home-title">
      <div className="max-w-2xl space-y-3">
        <p className="tracking-label text-accent text-xs font-semibold uppercase">New conversion</p>
        <h1 id="home-title" className="text-3xl font-semibold tracking-tight">
          What are you bringing in?
        </h1>
        <p className="text-muted-foreground leading-7">
          Choose something already downloaded. Mangabound never downloads chapters and never opens
          pages in an integrated reader.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <button
          className="border-border bg-surface hover:border-accent/60 focus-visible:ring-ring group rounded-xl border p-6 text-left transition-[border-color,transform] outline-none hover:-translate-y-0.5 focus-visible:ring-2"
          disabled={disabled}
          onClick={() => {
            onChoose('folder');
          }}
          type="button"
        >
          <FolderOpen aria-hidden="true" className="text-accent size-6" />
          <span className="mt-6 block text-base font-semibold">Manga folder</span>
          <span className="text-muted-foreground mt-2 block text-sm leading-6">
            Inspect parsed chapters and build or correct their volume mapping.
          </span>
        </button>
        <button
          className="border-border bg-surface hover:border-accent/60 focus-visible:ring-ring group rounded-xl border p-6 text-left transition-[border-color,transform] outline-none hover:-translate-y-0.5 focus-visible:ring-2"
          disabled={disabled}
          onClick={() => {
            onChoose('cbz');
          }}
          type="button"
        >
          <FileArchive aria-hidden="true" className="text-accent size-6" />
          <span className="mt-6 block text-base font-semibold">One CBZ file</span>
          <span className="text-muted-foreground mt-2 block text-sm leading-6">
            Convert an existing book directly with mangapress; mangabind is bypassed.
          </span>
        </button>
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

export function ConversionSettings({
  format,
  inspection,
  library,
  mapping,
  onBack,
  onChooseLibrary,
  onFormat,
  onPlan,
  onSettings,
  onStart,
  settings,
  plan,
  planning,
  profiles,
}: {
  readonly format: BookFormat;
  readonly inspection: InspectedInputPayload;
  readonly library?: SelectedLibrary;
  readonly mapping?: MappingDraft;
  readonly onBack: () => void;
  readonly onChooseLibrary: () => void;
  readonly onFormat: (format: BookFormat) => void;
  readonly onPlan: () => void;
  readonly onSettings: (settings: MangapressSettings) => void;
  readonly onStart: () => void;
  readonly settings: MangapressSettings;
  readonly plan?: PlanSummary;
  readonly planning: boolean;
  readonly profiles: readonly DeviceProfileSummary[];
}): React.JSX.Element {
  const settingIssues = validateMangapressSettings(settings);
  return (
    <section className="mx-auto max-w-5xl space-y-6" aria-labelledby="settings-title">
      <Button onClick={onBack} variant="ghost">
        <ArrowLeft /> Back
      </Button>
      <div>
        <p className="tracking-label text-accent text-xs font-semibold uppercase">Output setup</p>
        <h1 id="settings-title" className="mt-2 text-3xl font-semibold tracking-tight">
          Convert {inspection.displayName}
        </h1>
        <p className="text-muted-foreground mt-3 text-sm">
          {inspection.kind === 'folder'
            ? `${String(mapping?.volumes.length ?? 0)} mapped volume${mapping?.volumes.length === 1 ? '' : 's'} will run sequentially.`
            : 'This CBZ will go directly to mangapress.'}
        </p>
      </div>
      <MangapressSettingsEditor
        format={format}
        onFormat={onFormat}
        onSettings={onSettings}
        profiles={profiles}
        settings={settings}
      />
      <div className="border-border bg-surface shadow-card rounded-xl border p-6">
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
      {settingIssues.length > 0 && (
        <p className="text-status-failed text-sm" role="alert">
          Review the highlighted output settings before converting.
        </p>
      )}
      {plan !== undefined && <PlanResult plan={plan} />}
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          disabled={library === undefined || settingIssues.length > 0 || planning}
          onClick={onPlan}
          size="lg"
          variant="outline"
        >
          {planning ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <CheckCircle2 />
          )}
          {planning ? 'Validating…' : 'Validate plan'}
        </Button>
        <Button
          disabled={library === undefined || settingIssues.length > 0 || planning}
          onClick={onStart}
          size="lg"
        >
          <MonitorSmartphone /> Start conversion
        </Button>
      </div>
    </section>
  );
}

export function PlanResult({ plan }: { readonly plan: PlanSummary }): React.JSX.Element {
  return (
    <section
      aria-labelledby="plan-title"
      className="border-status-complete/40 bg-status-complete/5 rounded-xl border p-5"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 aria-hidden="true" className="text-status-complete mt-0.5 size-5" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold" id="plan-title">
            Plan validated
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">{plan.message}</p>
          <ul className="mt-3 space-y-1 text-sm">
            {plan.books.map((book) => (
              <li className="flex justify-between gap-4" key={book.name}>
                <span className="truncate">{book.name}</span>
                <span className="text-muted-foreground shrink-0">
                  {String(book.pageCount)} page{book.pageCount === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
          {plan.issues.length > 0 && (
            <p className="text-status-warning mt-3 text-xs">
              {String(plan.issues.length)} warning{plan.issues.length === 1 ? '' : 's'} reported by{' '}
              {plan.tool}.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function Running({
  onCancel,
  progress,
  selection,
}: {
  readonly onCancel: () => void;
  readonly progress?: ConversionProgress;
  readonly selection?: SelectedInput;
}): React.JSX.Element {
  const percentage =
    progress?.completed !== undefined && progress.total !== undefined
      ? Math.round((progress.completed / progress.total) * 100)
      : undefined;
  return (
    <section className="mx-auto flex min-h-96 max-w-xl flex-col justify-center" aria-live="polite">
      <LoaderCircle aria-hidden="true" className="text-accent size-7 animate-spin" />
      <p className="tracking-label text-accent mt-6 text-xs font-semibold uppercase">
        {progress?.stage ?? 'Processing'}
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Converting {selection?.displayName ?? 'book'}</h1>
      <p className="text-muted-foreground mt-3 text-sm">{progress?.message}</p>
      {percentage !== undefined && (
        <div
          className="mt-5"
          aria-label={`${String(percentage)}% complete`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
        >
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div
              className="bg-accent h-full rounded-full transition-[width]"
              style={{ width: `${String(percentage)}%` }}
            />
          </div>
        </div>
      )}
      <Button className="mt-8 self-start" onClick={onCancel} variant="outline">
        <Square /> Cancel conversion
      </Button>
    </section>
  );
}

export function Complete({
  artifacts,
  onOpen,
  onShow,
  onStartOver,
}: {
  readonly artifacts: readonly ArtifactSummary[];
  readonly onOpen: (artifactId: string) => void;
  readonly onShow: (artifactId: string) => void;
  readonly onStartOver: () => void;
}): React.JSX.Element {
  return (
    <section className="mx-auto max-w-3xl space-y-6" aria-labelledby="complete-title">
      <BookCheck aria-hidden="true" className="text-status-complete size-8" />
      <div>
        <p className="tracking-label text-status-complete text-xs font-semibold uppercase">
          Complete
        </p>
        <h1 id="complete-title" className="mt-2 text-3xl font-semibold tracking-tight">
          {String(artifacts.length)} book{artifacts.length === 1 ? '' : 's'} saved
        </h1>
        <p className="text-muted-foreground mt-3 text-sm">
          Open uses your operating system’s default app. Mangabound does not include a reader.
        </p>
      </div>
      <div className="space-y-3">
        {artifacts.map((artifact) => (
          <article
            className="border-border bg-surface flex flex-wrap items-center gap-4 rounded-xl border p-5"
            key={artifact.id}
          >
            <FileArchive aria-hidden="true" className="text-accent size-5" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">{artifact.name}</h2>
              <p className="text-muted-foreground mt-1 text-xs">{formatBytes(artifact.bytes)}</p>
            </div>
            <Button
              onClick={() => {
                onOpen(artifact.id);
              }}
            >
              Open
            </Button>
            <Button
              onClick={() => {
                onShow(artifact.id);
              }}
              variant="outline"
            >
              Show in folder
            </Button>
          </article>
        ))}
      </div>
      <Button onClick={onStartOver} variant="ghost">
        Convert something else
      </Button>
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
        <p className="tracking-label text-accent text-xs font-semibold uppercase">
          Architecture checkpoint
        </p>
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
          <article
            key={title}
            className="border-border bg-surface shadow-card rounded-xl border p-5"
          >
            <Icon aria-hidden="true" className="text-accent mb-5 size-5" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-muted-foreground mt-2 text-sm leading-6">{description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
