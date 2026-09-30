import type {
  ConversionArtifact,
  ConversionProgress,
  VolumeConversionProgress,
} from '@/domain/conversion';

export interface VolumeProductionContext {
  readonly title?: string;
  readonly onArtifact?: (artifact: ConversionArtifact) => void;
  readonly onProgress: (progress: ConversionProgress) => void;
  readonly signal?: AbortSignal;
}

/** Completed books accompany a failure; its original thrown value may be anything. */
export type VolumeProductionResult =
  | { readonly status: 'done'; readonly artifacts: readonly ConversionArtifact[] }
  | {
      readonly status: 'failed';
      readonly artifacts: readonly ConversionArtifact[];
      readonly error: unknown;
    };

/** Schedule one title's volumes and report completed books in input order (ADR 0027). */
export async function produceVolumes(
  volumeCount: number,
  convertAt: (
    index: number,
    signal: AbortSignal | undefined,
    onProgress: (progress: ConversionProgress) => void,
  ) => Promise<ConversionArtifact>,
  {
    maxParallelConversions,
    sequential,
    ...context
  }: VolumeProductionContext & {
    readonly maxParallelConversions: number;
    /** Bind-only copies must not compete for the destination. */
    readonly sequential: boolean;
  },
): Promise<VolumeProductionResult> {
  const artifacts: ConversionArtifact[] = [];
  try {
    // Copying bound CBZs is cheap and must not compete for the destination. One book needs no pool.
    if (sequential || volumeCount === 1) {
      for (let index = 0; index < volumeCount; index += 1) {
        context.signal?.throwIfAborted();
        const artifact = await convertAt(index, context.signal, context.onProgress);
        artifacts.push(artifact);
        context.onArtifact?.(artifact);
      }
      return { status: 'done', artifacts };
    }

    context.signal?.throwIfAborted();
    const controller = new AbortController();
    const cancel = (): void => {
      controller.abort(context.signal?.reason);
    };
    context.signal?.addEventListener('abort', cancel, { once: true });
    const ordered: (ConversionArtifact | undefined)[] = Array.from({ length: volumeCount });
    const fractions = Array.from({ length: volumeCount }, () => 0);
    const volumes: VolumeConversionProgress[] = Array.from(
      { length: volumeCount },
      (_input, index) => ({
        number: index + 1,
        status: 'waiting',
      }),
    );
    let next = 0;
    let nextToPublish = 0;
    let failure: { readonly error: unknown } | undefined;
    // The first failure is the one reported; a worker that fails later, while others finish, is not.
    const recordFailure = (error: unknown): void => {
      failure ??= { error };
    };

    const publishReady = (): void => {
      while (ordered[nextToPublish] !== undefined) {
        const artifact = ordered[nextToPublish]!;
        nextToPublish += 1;
        artifacts.push(artifact);
        context.onArtifact?.(artifact);
      }
    };

    const progressFor = (index: number, progress?: ConversionProgress): void => {
      if (progress !== undefined) {
        const previous = volumes[index]!;
        volumes[index] = {
          ...previous,
          status: progress.stage === 'saving' ? 'saving' : 'processing',
          ...(progress.completed === undefined || progress.total === undefined
            ? {}
            : { completed: progress.completed, total: progress.total }),
        };
      }
      if (progress?.completed !== undefined && progress.total !== undefined && progress.total > 0) {
        fractions[index] = Math.max(
          fractions[index]!,
          Math.min(0.99, progress.completed / progress.total),
        );
      }
      const done = ordered.filter((artifact) => artifact !== undefined).length;
      context.onProgress({
        stage: 'processing',
        ...(context.title === undefined ? {} : { title: context.title }),
        volume: `${String(index + 1)} of ${String(volumeCount)}`,
        message: `${context.title === undefined ? '' : `${context.title} · `}${String(done)} of ${String(volumeCount)} volumes converted.`,
        completed: fractions.reduce((sum, fraction) => sum + fraction, 0),
        total: volumeCount,
        volumes: [...volumes],
      });
    };

    const worker = async (): Promise<void> => {
      while (!controller.signal.aborted && failure === undefined && next < volumeCount) {
        const index = next++;
        try {
          const artifact = await convertAt(index, controller.signal, (progress) => {
            progressFor(index, progress);
          });
          ordered[index] = artifact;
          fractions[index] = 1;
          const currentVolume = volumes[index]!;
          volumes[index] = {
            ...currentVolume,
            status: 'done',
            ...(currentVolume.total === undefined ? {} : { completed: currentVolume.total }),
          };
          progressFor(index);
          publishReady();
        } catch (error) {
          recordFailure(error);
        }
      }
    };

    try {
      progressFor(0);
      await Promise.all(
        Array.from({ length: Math.min(maxParallelConversions, volumeCount) }, worker),
      );
    } finally {
      context.signal?.removeEventListener('abort', cancel);
    }
    // A failed volume can leave a gap in the ordered prefix. Keep later completed books too.
    for (const artifact of ordered.slice(nextToPublish)) {
      if (artifact !== undefined) {
        artifacts.push(artifact);
        context.onArtifact?.(artifact);
      }
    }
    if (failure !== undefined) throw failure.error;
    context.signal?.throwIfAborted();
    return { status: 'done', artifacts };
  } catch (error) {
    return { status: 'failed', artifacts, error };
  }
}
