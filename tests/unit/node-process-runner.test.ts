import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { createNodeProcessRunner, type SpawnProcess } from '@/adapters/process/node-process-runner';
import {
  ProcessCancelledError,
  ProcessOutputLimitError,
  ProcessStartError,
} from '@/application/ports/process-runner';

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn(() => true);
  return child;
}

function fakeSpawner(child: ReturnType<typeof fakeChild>): SpawnProcess {
  return vi.fn(() => child) as unknown as SpawnProcess;
}

describe('Node process runner', () => {
  it('runs without a shell and preserves Unicode and space-containing arguments', async () => {
    const runner = createNodeProcessRunner();
    const result = await runner.run({
      executablePath: process.execPath,
      arguments: [
        '-e',
        "process.stdout.write(process.argv[1]); process.stderr.write('diagnostic')",
        'São José & friends',
      ],
    });

    expect(result).toMatchObject({
      exitCode: 0,
      signal: null,
      stdout: 'São José & friends',
      stderr: 'diagnostic',
    });
  });

  it('returns nonzero exit codes for an adapter to interpret', async () => {
    const runner = createNodeProcessRunner();
    const result = await runner.run({
      executablePath: process.execPath,
      arguments: ['-e', 'process.exitCode = 7'],
      cwd: process.cwd(),
    });

    expect(result.exitCode).toBe(7);
  });

  it('streams separated output chunks', async () => {
    const child = fakeChild();
    const onChunk = vi.fn();
    const resultPromise = createNodeProcessRunner({ spawnProcess: fakeSpawner(child) }).run(
      { executablePath: 'tool', arguments: [] },
      { onChunk },
    );

    child.stdout.write(Buffer.from('ready'));
    child.stderr.write(Buffer.from('warning'));
    child.emit('close', 0, null);

    await expect(resultPromise).resolves.toMatchObject({ stdout: 'ready', stderr: 'warning' });
    expect(onChunk).toHaveBeenNthCalledWith(1, { stream: 'stdout', text: 'ready' });
    expect(onChunk).toHaveBeenNthCalledWith(2, { stream: 'stderr', text: 'warning' });
  });

  it('rejects cancellation before and during execution', async () => {
    const alreadyCancelled = new AbortController();
    alreadyCancelled.abort();
    await expect(
      createNodeProcessRunner().run(
        { executablePath: 'unused', arguments: [] },
        { signal: alreadyCancelled.signal },
      ),
    ).rejects.toBeInstanceOf(ProcessCancelledError);

    const child = fakeChild();
    const controller = new AbortController();
    const resultPromise = createNodeProcessRunner({ spawnProcess: fakeSpawner(child) }).run(
      { executablePath: 'tool', arguments: [] },
      { signal: controller.signal },
    );
    controller.abort();

    await expect(resultPromise).rejects.toBeInstanceOf(ProcessCancelledError);
    expect(child.kill).toHaveBeenCalledOnce();
    child.emit('close', null, 'SIGTERM');
  });

  it('wraps spawn failures but preserves cancellation races', async () => {
    const failedChild = fakeChild();
    const failure = createNodeProcessRunner({ spawnProcess: fakeSpawner(failedChild) }).run({
      executablePath: 'missing',
      arguments: [],
    });
    failedChild.emit('error', new Error('ENOENT internal path'));
    await expect(failure).rejects.toBeInstanceOf(ProcessStartError);

    const cancelledChild = fakeChild();
    const controller = new AbortController();
    const cancelled = createNodeProcessRunner({ spawnProcess: fakeSpawner(cancelledChild) }).run(
      { executablePath: 'tool', arguments: [] },
      { signal: controller.signal },
    );
    controller.abort();
    cancelledChild.emit('error', new Error('abort race'));
    await expect(cancelled).rejects.toBeInstanceOf(ProcessCancelledError);
  });

  it('stops processes that exceed the capture limit or whose stream consumer fails', async () => {
    const noisyChild = fakeChild();
    const tooLarge = createNodeProcessRunner({
      maxOutputBytes: 3,
      spawnProcess: fakeSpawner(noisyChild),
    }).run({ executablePath: 'tool', arguments: [] });
    noisyChild.stdout.write(Buffer.from('four'));
    await expect(tooLarge).rejects.toBeInstanceOf(ProcessOutputLimitError);
    expect(noisyChild.kill).toHaveBeenCalledOnce();

    const callbackChild = fakeChild();
    const callbackError = new Error('decoder rejected a chunk');
    const rejected = createNodeProcessRunner({ spawnProcess: fakeSpawner(callbackChild) }).run(
      { executablePath: 'tool', arguments: [] },
      {
        onChunk: () => {
          throw callbackError;
        },
      },
    );
    callbackChild.stdout.write(Buffer.from('event'));
    await expect(rejected).rejects.toBe(callbackError);
    callbackChild.stdout.write(Buffer.from('ignored'));

    const nonErrorChild = fakeChild();
    const nonError = createNodeProcessRunner({ spawnProcess: fakeSpawner(nonErrorChild) }).run(
      { executablePath: 'tool', arguments: [] },
      {
        onChunk: () => {
          // Process callbacks cross a JavaScript boundary and may violate the Error convention.
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'non-error callback failure';
        },
      },
    );
    nonErrorChild.stderr.write(Buffer.from('event'));
    await expect(nonError).rejects.toThrow('The process runner failed.');
  });

  it('flushes partial UTF-8 characters and handles a consumer failure during the final flush', async () => {
    const partialChild = fakeChild();
    const onChunk = vi.fn();
    const partial = createNodeProcessRunner({ spawnProcess: fakeSpawner(partialChild) }).run(
      { executablePath: 'tool', arguments: [] },
      { onChunk },
    );
    partialChild.stdout.write(Buffer.from([0xe2]));
    partialChild.stderr.write(Buffer.from([0xe2]));
    partialChild.emit('close', 0, null);

    await expect(partial).resolves.toMatchObject({ stdout: '�', stderr: '�' });
    expect(onChunk).toHaveBeenCalledWith({ stream: 'stdout', text: '�' });
    expect(onChunk).toHaveBeenCalledWith({ stream: 'stderr', text: '�' });

    const rejectedChild = fakeChild();
    const callbackError = new Error('final decoder rejected a chunk');
    const rejected = createNodeProcessRunner({ spawnProcess: fakeSpawner(rejectedChild) }).run(
      { executablePath: 'tool', arguments: [] },
      {
        onChunk: ({ text }) => {
          if (text !== '') throw callbackError;
        },
      },
    );
    rejectedChild.stdout.write(Buffer.from([0xe2]));
    rejectedChild.emit('close', 0, null);

    await expect(rejected).rejects.toBe(callbackError);
    expect(rejectedChild.kill).toHaveBeenCalledOnce();
  });
});
