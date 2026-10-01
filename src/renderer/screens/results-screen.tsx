import {
  BookOpen,
  CircleAlert,
  Download,
  ExternalLink,
  FolderOpen,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { RunOutcome as ReportOutcome } from '@/domain/run-report';
import { Button } from '@/renderer/components/ui/button';
import type { ArtifactSummary } from '@/shared/workflow-contract';

/** What became of one queue item in a run. */
export type RunOutcome = ReportOutcome<ArtifactSummary>;

export interface ResultsScreenProps {
  readonly onBack: () => void;
  readonly onFix: (rowId: string) => void;
  readonly onOpen: (artifactId: string) => void;
  readonly onShow: (artifactId: string) => void;
  readonly onSaveAs?: (artifactId: string) => void;
  readonly onSaveAll?: (artifactIds: readonly string[]) => void;
  readonly savedIds?: ReadonlySet<string>;
  readonly outcomes: readonly RunOutcome[];
  /** A short description of how the books were made, shown under the heading. */
  readonly summary?: string;
  /** The card that lets a reader pull ready books; rendered beside the list. */
  readonly aside?: React.ReactNode;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResultsScreen({
  aside,
  onBack,
  onFix,
  onOpen,
  onShow,
  onSaveAs,
  onSaveAll,
  savedIds,
  outcomes,
  summary,
}: ResultsScreenProps): React.JSX.Element {
  const artifacts = outcomes.flatMap((outcome) => outcome.artifacts);
  const problems = outcomes.filter((outcome) => outcome.status !== 'done');
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  return (
    <section
      aria-labelledby="results-title"
      className={
        aside === undefined
          ? 'space-y-6'
          : 'grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]'
      }
    >
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1
              className="focus-visible:ring-ring focus-visible:ring-offset-background rounded-md text-2xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              id="results-title"
              ref={titleRef}
              tabIndex={-1}
            >
              {artifacts.length === 0
                ? 'No books were produced'
                : `${String(artifacts.length)} book${artifacts.length === 1 ? '' : 's'} ready`}
            </h1>
            {summary !== undefined && (
              <p className="text-subtle-foreground mt-1 text-sm break-all">{summary}</p>
            )}
          </div>
          <Button onClick={onBack} variant="outline">
            Convert more
          </Button>
        </div>

        {artifacts.length > 1 && onSaveAll !== undefined && (
          <Button
            onClick={() => {
              onSaveAll(artifacts.map((artifact) => artifact.id));
            }}
            title="Existing files are not replaced; a repeated save may add numbered copies."
            variant="outline"
          >
            <Download /> Save all to folder…
          </Button>
        )}
        {artifacts.length > 0 && (
          <ul aria-label="Ready books" className="space-y-1">
            {artifacts.map((artifact) => (
              <li
                className="hover:bg-muted/40 flex items-center gap-3 rounded-xl px-3 py-2.5"
                key={artifact.id}
              >
                <span
                  aria-hidden="true"
                  className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg"
                >
                  <BookOpen className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{artifact.name}</p>
                  <p className="text-subtle-foreground text-xs">
                    {formatBytes(artifact.bytes)} ·{' '}
                    {savedIds?.has(artifact.id) === true ? 'Saved' : 'Not saved yet'}
                  </p>
                </div>
                {onSaveAs !== undefined && (
                  <Button
                    aria-label={`Save ${artifact.name} as`}
                    onClick={() => {
                      onSaveAs(artifact.id);
                    }}
                    size="sm"
                    variant="outline"
                  >
                    Save as…
                  </Button>
                )}
                {savedIds?.has(artifact.id) === true && (
                  <Button
                    aria-label={`Show ${artifact.name} in its folder`}
                    onClick={() => {
                      onShow(artifact.id);
                    }}
                    size="icon"
                    variant="outline"
                  >
                    <FolderOpen />
                  </Button>
                )}
                <Button
                  aria-label={`Open ${artifact.name}`}
                  onClick={() => {
                    onOpen(artifact.id);
                  }}
                  size="icon"
                  variant="outline"
                >
                  <ExternalLink />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {problems.map((outcome) => (
          <div
            className={
              outcome.status === 'failed'
                ? 'border-status-failed/40 bg-status-failed/10 flex items-start gap-3 rounded-xl border p-4'
                : 'border-status-warning/40 bg-status-warning/10 flex items-start gap-3 rounded-xl border p-4'
            }
            key={`${outcome.rowId}:${outcome.name}`}
            role="status"
          >
            {outcome.status === 'failed' ? (
              <CircleAlert
                aria-hidden="true"
                className="text-status-failed mt-0.5 size-5 shrink-0"
              />
            ) : (
              <TriangleAlert
                aria-hidden="true"
                className="text-status-warning mt-0.5 size-5 shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {outcome.name}{' '}
                {outcome.status === 'failed' ? 'could not be converted' : 'was skipped'}
              </p>
              {outcome.message !== undefined && (
                <p className="text-muted-foreground mt-0.5 text-sm">{outcome.message}</p>
              )}
            </div>
            {outcome.fixable === true && (
              <Button
                aria-label={`Fix ${outcome.name}`}
                onClick={() => {
                  onFix(outcome.rowId);
                }}
                variant="outline"
              >
                Fix
              </Button>
            )}
          </div>
        ))}
      </div>
      {aside}
    </section>
  );
}
