import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProcessCancelledError } from '@/application/ports/process-runner';
import type { ConversionArtifact } from '@/domain/conversion';
import { emptyLibraryManifest } from '@/library/manifest';
import { runJob } from '@/main/ipc/run-job';
import { PendingRunActivity } from '@/main/pending-run-activity';

type JobContext = Parameters<typeof runJob>[1];
function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}
const command = { jobId: 'job', libraryId: 'run' };
const libraryPath = path.resolve('pending', 'run');
const book = (id: string): ConversionArtifact => ({
  id,
  name: `${id}.epub`,
  path: path.join(libraryPath, `${id}.epub`),
  bytes: 100,
  format: 'epub',
  title: 'Manga',
  author: 'Unknown',
});

function context(): JobContext {
  return {
    selectedLibraries: new Map([['run', libraryPath]]),
    activeJobs: new Map(),
    artifactPaths: new Map(),
    pendingArtifacts: new Map(),
    pendingRunActivity: new PendingRunActivity(),
    libraryPublisher: { publish: vi.fn().mockResolvedValue(emptyLibraryManifest) },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('conversion job lifetime', () => {
  it('checks the missing library before deletion or duplicate-job state', async () => {
    const state = context();
    state.selectedLibraries.clear();
    state.pendingRunActivity.beginDelete('run');
    const existing = new AbortController();
    state.activeJobs.set('job', existing);
    const run = vi.fn();

    expect(await runJob(command, state, run)).toEqual({
      ok: false,
      error: {
        code: 'library_not_found',
        message: 'The pending conversion is no longer available.',
      },
    });
    expect(run).not.toHaveBeenCalled();
    expect(state.activeJobs.get('job')).toBe(existing);
  });

  it('checks deletion before duplicate-job state and does not run', async () => {
    const state = context();
    state.pendingRunActivity.beginDelete('run');
    const existing = new AbortController();
    state.activeJobs.set('job', existing);
    const run = vi.fn();

    expect(await runJob(command, state, run)).toEqual({
      ok: false,
      error: {
        code: 'pending_in_use',
        message: 'The pending conversion is being deleted.',
      },
    });
    expect(run).not.toHaveBeenCalled();
    expect(state.activeJobs.get('job')).toBe(existing);
  });

  it('never replaces the controller of an already running job', async () => {
    const state = context();
    const existing = new AbortController();
    state.activeJobs.set('job', existing);
    const run = vi.fn();

    expect(await runJob(command, state, run)).toEqual({
      ok: false,
      error: {
        code: 'job_exists',
        message: 'That conversion is already running.',
      },
    });
    expect(run).not.toHaveBeenCalled();
    expect(state.activeJobs.get('job')).toBe(existing);
  });

  it('registers before execution, forwards cancellation and cleans up without any book', async () => {
    const state = context();
    const result = await runJob(command, state, (folder, { signal }) => {
      expect(folder).toBe(libraryPath);
      expect(state.activeJobs.get('job')?.signal).toBe(signal);
      expect(signal.aborted).toBe(false);
      state.activeJobs.get('job')!.abort();
      expect(signal.aborted).toBe(true);
      return Promise.resolve('complete');
    });

    expect(result).toEqual({ ok: true, value: 'complete' });
    expect(state.activeJobs.size).toBe(0);
    expect(state.libraryPublisher.publish).not.toHaveBeenCalled();
  });

  it('tracks paths immediately and waits for ordered catalog writes before releasing the job', async () => {
    const state = context();
    const publication = deferred<typeof emptyLibraryManifest>();
    const published = deferred<void>();
    const publish = vi.spyOn(state.libraryPublisher, 'publish').mockImplementationOnce(() => {
      published.resolve();
      return publication.promise;
    });
    const first = book('one');
    const second = book('two');
    const run = runJob(command, state, (_folder, { onArtifact }) => {
      onArtifact(first);
      onArtifact(second);
      expect(state.artifactPaths.get('one')).toBe(first.path);
      expect(state.pendingArtifacts.get('two')).toEqual({ runId: 'run', relativePath: 'two.epub' });
      return Promise.resolve([first, second]);
    });
    await published.promise;
    expect(publish).toHaveBeenCalledExactlyOnceWith(libraryPath, first);
    expect(state.activeJobs.has('job')).toBe(true);
    publication.resolve(emptyLibraryManifest);

    expect(await run).toEqual({ ok: true, value: [first, second] });
    expect(publish.mock.calls).toEqual([
      [libraryPath, first],
      [libraryPath, second],
    ]);
    expect(state.activeJobs.size).toBe(0);
  });

  it.each([new Error('conversion failed'), new ProcessCancelledError(), 'boom'])(
    'preserves the original failure and earlier books until publication settles (%s)',
    async (cause) => {
      const state = context();
      const publication = deferred<typeof emptyLibraryManifest>();
      const published = deferred<void>();
      const publish = vi.spyOn(state.libraryPublisher, 'publish').mockImplementationOnce(() => {
        published.resolve();
        return publication.promise;
      });
      const first = book('one');
      const run = runJob(command, state, (_folder, { onArtifact }) => {
        onArtifact(first);
        const failed = deferred<never>();
        failed.reject(cause);
        return failed.promise;
      });
      const checked = expect(run).rejects.toBe(cause);
      await published.promise;
      expect(state.activeJobs.has('job')).toBe(true);
      publication.resolve(emptyLibraryManifest);
      await checked;

      expect(publish).toHaveBeenCalledExactlyOnceWith(libraryPath, first);
      expect(state.artifactPaths.get('one')).toBe(first.path);
      expect(state.pendingArtifacts.get('one')).toEqual({ runId: 'run', relativePath: 'one.epub' });
      expect(state.activeJobs.size).toBe(0);
    },
  );

  it('logs a failed catalog write but keeps later publications and successful conversion', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const state = context();
    const cause = new Error('catalog locked');
    const publish = vi.spyOn(state.libraryPublisher, 'publish').mockRejectedValueOnce(cause);
    const first = book('one');
    const second = book('two');

    expect(
      await runJob(command, state, (_folder, { onArtifact }) => {
        onArtifact(first);
        onArtifact(second);
        return Promise.resolve([first, second]);
      }),
    ).toEqual({ ok: true, value: [first, second] });
    expect(publish.mock.calls).toEqual([
      [libraryPath, first],
      [libraryPath, second],
    ]);
    expect(logged).toHaveBeenCalledExactlyOnceWith(
      'Failed to publish a saved book to the library catalog.',
      cause,
    );
    expect(state.activeJobs.size).toBe(0);
  });

  it('cleans up even if the run callback throws synchronously', async () => {
    const state = context();
    const cause = new Error('tools unavailable');
    await expect(
      runJob(command, state, () => {
        throw cause;
      }),
    ).rejects.toBe(cause);
    expect(state.activeJobs.size).toBe(0);
  });
});
