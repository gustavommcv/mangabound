import { describe, expect, it, vi } from 'vitest';

import { produceVolumes } from '@/application/workflows/volume-production';
import type { ConversionArtifact, ConversionProgress } from '@/domain/conversion';

type ProduceVolume = Parameters<typeof produceVolumes>[1];
type PoolOptions = Parameters<typeof produceVolumes>[2];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

function book(index: number): ConversionArtifact {
  return {
    id: `book-${String(index + 1)}`,
    name: `Volume ${String(index + 1)}.epub`,
    path: `/pending/Volume ${String(index + 1)}.epub`,
    bytes: 100,
    format: 'epub',
    title: 'Manga',
    author: 'Unknown',
  };
}

function options(overrides: Partial<PoolOptions> = {}): PoolOptions {
  return { maxParallelConversions: 2, sequential: false, onProgress: vi.fn(), ...overrides };
}

describe('volume production', () => {
  it('keeps one book direct, forwarding its progress and the original signal', async () => {
    const controller = new AbortController();
    const onProgress = vi.fn();
    const onArtifact = vi.fn<NonNullable<PoolOptions['onArtifact']>>();
    const update: ConversionProgress = { stage: 'saving', message: 'Saving the book…' };
    const convertAt = vi.fn<ProduceVolume>((_index, _signal, report) => {
      report(update);
      return Promise.resolve(book(0));
    });
    const result = await produceVolumes(
      1,
      convertAt,
      options({
        signal: controller.signal,
        onProgress,
        onArtifact,
        maxParallelConversions: 3,
      }),
    );
    expect(result).toEqual({ status: 'done', artifacts: [book(0)] });
    expect(convertAt).toHaveBeenCalledExactlyOnceWith(0, controller.signal, onProgress);
    expect(onProgress).toHaveBeenCalledExactlyOnceWith(update);
    expect(onArtifact).toHaveBeenCalledExactlyOnceWith(book(0));
  });

  it('keeps copies sequential and returns completed books with the original failure', async () => {
    const first = deferred<ConversionArtifact>();
    const error = new Error('Cannot save volume 2');
    const convertAt = vi.fn<ProduceVolume>((index) =>
      index === 0 ? first.promise : Promise.reject(error),
    );
    const onArtifact = vi.fn<NonNullable<PoolOptions['onArtifact']>>();
    const run = produceVolumes(3, convertAt, options({ sequential: true, onArtifact }));
    expect(convertAt).toHaveBeenCalledTimes(1);
    first.resolve(book(0));
    const result = await run;
    expect(result).toEqual({ status: 'failed', artifacts: [book(0)], error });
    expect(convertAt).toHaveBeenCalledTimes(2);
    expect(onArtifact).toHaveBeenCalledExactlyOnceWith(book(0));
  });

  it('bounds active work and publishes a ready prefix before the last volume finishes', async () => {
    const jobs = Array.from({ length: 4 }, () => deferred<ConversionArtifact>());
    let active = 0;
    let peak = 0;
    const convertAt = vi.fn<ProduceVolume>((index) => {
      active += 1;
      peak = Math.max(peak, active);
      return jobs[index]!.promise.finally(() => {
        active -= 1;
      });
    });
    const onArtifact = vi.fn<NonNullable<PoolOptions['onArtifact']>>();
    const run = produceVolumes(4, convertAt, options({ onArtifact }));
    expect(convertAt).toHaveBeenCalledTimes(2);
    jobs[1]!.resolve(book(1));
    await vi.waitFor(() => {
      expect(convertAt).toHaveBeenCalledTimes(3);
    });
    expect(onArtifact).not.toHaveBeenCalled();
    jobs[2]!.resolve(book(2));
    await vi.waitFor(() => {
      expect(convertAt).toHaveBeenCalledTimes(4);
    });
    jobs[0]!.resolve(book(0));
    await vi.waitFor(() => {
      expect(onArtifact).toHaveBeenCalledTimes(3);
    });
    expect(onArtifact.mock.calls.map(([artifact]) => artifact.id)).toEqual([
      'book-1',
      'book-2',
      'book-3',
    ]);
    jobs[3]!.resolve(book(3));
    expect(await run).toEqual({ status: 'done', artifacts: [0, 1, 2, 3].map(book) });
    expect(peak).toBe(2);
    expect(onArtifact.mock.calls.map(([artifact]) => artifact.id)).toEqual([
      'book-1',
      'book-2',
      'book-3',
      'book-4',
    ]);
  });

  it.each([new Error('Volume 1 failed'), undefined, null])(
    'retains later completed books and stops scheduling for a failure of %s',
    async (error) => {
      const jobs = [deferred<ConversionArtifact>(), deferred<ConversionArtifact>()];
      const signals: (AbortSignal | undefined)[] = [];
      const convertAt = vi.fn<ProduceVolume>((index, signal) => {
        signals.push(signal);
        return jobs[index]!.promise;
      });
      const onArtifact = vi.fn();
      const run = produceVolumes(3, convertAt, options({ onArtifact }));
      jobs[0]!.reject(error);
      await Promise.resolve();
      expect(signals[1]!.aborted).toBe(false);
      jobs[1]!.resolve(book(1));
      expect(await run).toEqual({ status: 'failed', artifacts: [book(1)], error });
      expect(convertAt).toHaveBeenCalledTimes(2);
      expect(onArtifact).toHaveBeenCalledExactlyOnceWith(book(1));
    },
  );

  it('reports the first failure even if another active worker fails later', async () => {
    const jobs = [deferred<ConversionArtifact>(), deferred<ConversionArtifact>()];
    const first = new Error('First failure');
    const later = new Error('Later failure');
    const convertAt = vi.fn<ProduceVolume>((index) => jobs[index]!.promise);
    const run = produceVolumes(3, convertAt, options());
    jobs[0]!.reject(first);
    await Promise.resolve();
    jobs[1]!.reject(later);
    expect(await run).toEqual({ status: 'failed', artifacts: [], error: first });
    expect(convertAt).toHaveBeenCalledTimes(2);
  });

  it.each([true, false])(
    'does not start an already cancelled run (sequential=%s)',
    async (sequential) => {
      const controller = new AbortController();
      const error = new DOMException('Cancelled', 'AbortError');
      controller.abort(error);
      const convertAt = vi.fn<ProduceVolume>();
      const onProgress = vi.fn();
      expect(
        await produceVolumes(
          2,
          convertAt,
          options({ sequential, onProgress, signal: controller.signal }),
        ),
      ).toEqual({ status: 'failed', artifacts: [], error });
      expect(convertAt).not.toHaveBeenCalled();
      expect(onProgress).not.toHaveBeenCalled();
    },
  );

  it('cancels every active worker, starts no later volume and keeps the published prefix', async () => {
    const controller = new AbortController();
    const jobs = Array.from({ length: 4 }, () => deferred<ConversionArtifact>());
    const stopped: number[] = [];
    const convertAt = vi.fn<ProduceVolume>((index, signal) => {
      signal!.addEventListener(
        'abort',
        () => {
          stopped.push(index);
          jobs[index]!.reject(signal!.reason);
        },
        { once: true },
      );
      return jobs[index]!.promise;
    });
    const onArtifact = vi.fn();
    const run = produceVolumes(4, convertAt, options({ onArtifact, signal: controller.signal }));
    jobs[0]!.resolve(book(0));
    await vi.waitFor(() => {
      expect(convertAt).toHaveBeenCalledTimes(3);
    });
    const error = new DOMException('Cancelled', 'AbortError');
    controller.abort(error);
    expect(await run).toEqual({ status: 'failed', artifacts: [book(0)], error });
    expect(stopped).toContain(1);
    expect(stopped).toContain(2);
    expect(convertAt).toHaveBeenCalledTimes(3);
    expect(onArtifact).toHaveBeenCalledExactlyOnceWith(book(0));
  });

  it('still reports cancellation if active producers finish without rejecting the abort', async () => {
    const controller = new AbortController();
    const jobs = [deferred<ConversionArtifact>(), deferred<ConversionArtifact>()];
    const convertAt = vi.fn<ProduceVolume>((index) => jobs[index]!.promise);
    const run = produceVolumes(3, convertAt, options({ signal: controller.signal }));
    const error = new DOMException('Cancelled', 'AbortError');
    controller.abort(error);
    jobs[0]!.resolve(book(0));
    jobs[1]!.resolve(book(1));
    expect(await run).toEqual({ status: 'failed', artifacts: [book(0), book(1)], error });
    expect(convertAt).toHaveBeenCalledTimes(2);
  });

  it('detaches cancellation after completion so a later abort does not reach finished work', async () => {
    const controller = new AbortController();
    const signals: AbortSignal[] = [];
    const convertAt = vi.fn<ProduceVolume>((index, signal) => {
      signals.push(signal!);
      return Promise.resolve(book(index));
    });
    expect(await produceVolumes(2, convertAt, options({ signal: controller.signal }))).toEqual({
      status: 'done',
      artifacts: [book(0), book(1)],
    });
    controller.abort();
    expect(signals.every((signal) => !signal.aborted)).toBe(true);
  });

  it('keeps aggregate progress monotonic, capped before completion, and snapshots independent', async () => {
    const jobs = [deferred<ConversionArtifact>(), deferred<ConversionArtifact>()];
    const reports: ((progress: ConversionProgress) => void)[] = [];
    const convertAt = vi.fn<ProduceVolume>((index, _signal, report) => {
      reports[index] = report;
      return jobs[index]!.promise;
    });
    const progress: ConversionProgress[] = [];
    const run = produceVolumes(
      2,
      convertAt,
      options({ title: 'Manga', onProgress: (update) => progress.push(update) }),
    );
    reports[0]!({ stage: 'processing', message: 'Page', completed: 1, total: 2 });
    reports[0]!({ stage: 'processing', message: 'Earlier page', completed: 0, total: 2 });
    reports[0]!({ stage: 'saving', message: 'Writing book', completed: 2, total: 2 });
    expect(progress.at(-1)).toMatchObject({
      completed: 0.99,
      total: 2,
      volumes: [
        { number: 1, status: 'saving', completed: 2, total: 2 },
        { number: 2, status: 'waiting' },
      ],
    });
    reports[1]!({ stage: 'processing', message: 'Unknown total', completed: 1, total: 0 });
    reports[1]!({ stage: 'processing', message: 'No total', completed: 1 });
    reports[1]!({ stage: 'processing', message: 'No count', total: 2 });
    jobs[0]!.resolve(book(0));
    jobs[1]!.resolve(book(1));
    expect((await run).status).toBe('done');
    expect(progress.map((update) => update.completed)).toEqual(
      [...progress.map((update) => update.completed)].sort((a, b) => a! - b!),
    );
    expect(progress[0]!.volumes!.map((volume) => volume.status)).toEqual(['waiting', 'waiting']);
    expect(progress.at(-1)).toMatchObject({
      completed: 2,
      total: 2,
      message: 'Manga · 2 of 2 volumes converted.',
    });
    expect(progress.every((update) => update.title === 'Manga')).toBe(true);
  });

  it.each([true, false])(
    'keeps a completed book if its publication callback fails (sequential=%s)',
    async (sequential) => {
      const error = new Error('Cannot index book');
      const onArtifact = vi.fn((artifact: ConversionArtifact) => {
        if (artifact.id === 'book-1') throw error;
      });
      const result = await produceVolumes(
        2,
        (index) => Promise.resolve(book(index)),
        options({ sequential, onArtifact }),
      );
      expect(result).toEqual({
        status: 'failed',
        artifacts: sequential ? [book(0)] : [book(0), book(1)],
        error,
      });
    },
  );

  it('returns the initial progress callback error and detaches cancellation without starting work', async () => {
    const controller = new AbortController();
    const error = new Error('Cannot report progress');
    const convertAt = vi.fn<ProduceVolume>();
    const onProgress = () => {
      throw error;
    };
    expect(
      await produceVolumes(2, convertAt, options({ signal: controller.signal, onProgress })),
    ).toEqual({ status: 'failed', artifacts: [], error });
    expect(convertAt).not.toHaveBeenCalled();
    controller.abort();
  });

  it('retains a later book even if its publication callback fails while flushing a failed run', async () => {
    const jobs = [deferred<ConversionArtifact>(), deferred<ConversionArtifact>()];
    const conversionError = new Error('Volume 1 failed');
    const publicationError = new Error('Cannot index volume 2');
    const run = produceVolumes(
      2,
      (index) => jobs[index]!.promise,
      options({
        onArtifact: () => {
          throw publicationError;
        },
      }),
    );
    jobs[0]!.reject(conversionError);
    jobs[1]!.resolve(book(1));
    expect(await run).toEqual({ status: 'failed', artifacts: [book(1)], error: publicationError });
  });
});
