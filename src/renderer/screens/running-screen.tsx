import { ChevronDown, LoaderCircle, Square } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import type { ConversionProgress, VolumeConversionProgress } from '@/domain/conversion';
import { Button } from '@/renderer/components/ui/button';

export interface RunPosition {
  readonly name: string;
  /** 1-based place of the item being processed among those a run will process. */
  readonly index: number;
  readonly total: number;
}

function percentageOf(
  completed: number | undefined,
  total: number | undefined,
): number | undefined {
  if (completed === undefined || total === undefined || total <= 0) return undefined;
  return completed >= total ? 100 : Math.min(99, Math.round((completed / total) * 100));
}

function ProgressMeter({
  label,
  percentage,
}: {
  readonly label: string;
  readonly percentage?: number;
}): React.JSX.Element {
  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percentage}
      role="progressbar"
    >
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className="bg-accent h-full rounded-full transition-[width]"
          style={{ width: `${String(percentage ?? 0)}%` }}
        />
      </div>
    </div>
  );
}

const volumeStatus: Record<VolumeConversionProgress['status'], string> = {
  waiting: 'Waiting',
  processing: 'Converting',
  saving: 'Saving',
  done: 'Complete',
};

export function RunningScreen({
  onCancel,
  position,
  progress,
}: {
  readonly onCancel: () => void;
  readonly position?: RunPosition;
  readonly progress?: ConversionProgress;
}): React.JSX.Element {
  const percentage = percentageOf(progress?.completed, progress?.total);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  return (
    <section className="mx-auto flex min-h-96 max-w-xl flex-col justify-center">
      <LoaderCircle aria-hidden="true" className="text-accent size-7 animate-spin" />
      <p className="text-muted-foreground mt-6 text-xs font-medium">
        {position === undefined
          ? (progress?.stage ?? 'Processing')
          : `Item ${String(position.index)} of ${String(position.total)}`}
      </p>
      <h1
        className="focus-visible:ring-ring focus-visible:ring-offset-background mt-2 rounded-md text-2xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        ref={titleRef}
        tabIndex={-1}
      >
        Converting {position?.name ?? 'your books'}
      </h1>
      <p aria-live="polite" className="text-muted-foreground mt-3 text-sm">
        {progress?.message}
      </p>
      {percentage !== undefined && (
        <div className="mt-5">
          <ProgressMeter label={`${String(percentage)}% complete`} percentage={percentage} />
        </div>
      )}
      {progress?.volumes !== undefined && progress.volumes.length > 1 && (
        <>
          <Button
            aria-controls={detailsOpen ? detailsId : undefined}
            aria-expanded={detailsOpen}
            className="mt-3 -ml-3 self-start"
            onClick={() => {
              setDetailsOpen((open) => !open);
            }}
            size="sm"
            variant="ghost"
          >
            <ChevronDown
              aria-hidden="true"
              className={detailsOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
            />
            {detailsOpen ? 'Hide details' : 'Show details'}
          </Button>
          {detailsOpen && (
            <div
              aria-label="Volume details"
              className="border-border bg-surface mt-2 space-y-3 rounded-xl border p-4"
              id={detailsId}
              role="region"
            >
              {progress.volumes.map((volume) => {
                const reported = percentageOf(volume.completed, volume.total);
                const volumePercentage =
                  volume.status === 'done'
                    ? 100
                    : reported === undefined
                      ? undefined
                      : Math.min(99, reported);
                return (
                  <div className="space-y-1.5" key={volume.number}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium">Volume {String(volume.number)}</span>
                      <span className="text-muted-foreground">
                        {volumeStatus[volume.status]}
                        {volumePercentage === undefined ? '' : ` · ${String(volumePercentage)}%`}
                      </span>
                    </div>
                    <ProgressMeter
                      label={`Volume ${String(volume.number)} progress`}
                      percentage={volumePercentage}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      <Button className="mt-8 self-start" onClick={onCancel} variant="outline">
        <Square /> Cancel conversion
      </Button>
    </section>
  );
}
