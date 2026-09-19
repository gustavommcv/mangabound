import { LoaderCircle, Square } from 'lucide-react';

import type { ConversionProgress } from '@/domain/conversion';
import { Button } from '@/renderer/components/ui/button';

export interface RunPosition {
  readonly name: string;
  /** 1-based place of the item being processed among those a run will process. */
  readonly index: number;
  readonly total: number;
}

export function RunningScreen({
  onCancel,
  position,
  progress,
}: {
  readonly onCancel: () => void;
  readonly position?: RunPosition;
  readonly progress?: ConversionProgress;
}): React.JSX.Element {
  const percentage =
    progress?.completed !== undefined && progress.total !== undefined
      ? Math.round((progress.completed / progress.total) * 100)
      : undefined;
  return (
    <section className="mx-auto flex min-h-96 max-w-xl flex-col justify-center" aria-live="polite">
      <LoaderCircle aria-hidden="true" className="text-accent size-7 animate-spin" />
      <p className="text-muted-foreground mt-6 text-xs font-medium">
        {position === undefined
          ? (progress?.stage ?? 'Processing')
          : `Item ${String(position.index)} of ${String(position.total)}`}
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Converting {position?.name ?? 'your books'}</h1>
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
