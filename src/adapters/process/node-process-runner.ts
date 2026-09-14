import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptions } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

import {
  ProcessCancelledError,
  ProcessOutputLimitError,
  type ProcessRequest,
  type ProcessResult,
  type ProcessRunner,
  ProcessStartError,
  type ProcessRunOptions,
} from '@/application/ports/process-runner';

export type SpawnProcess = (
  executablePath: string,
  arguments_: readonly string[],
  options: SpawnOptions,
) => ChildProcessWithoutNullStreams;

const spawnProcess: SpawnProcess = (executablePath, arguments_, options) =>
  spawn(executablePath, [...arguments_], { ...options, stdio: 'pipe' });

export function createNodeProcessRunner({
  maxOutputBytes = 64 * 1024 * 1024,
  spawnProcess: spawnChild = spawnProcess,
}: {
  readonly maxOutputBytes?: number;
  readonly spawnProcess?: SpawnProcess;
} = {}): ProcessRunner {
  return {
    run: (request, options = {}) => runNodeProcess(request, options, spawnChild, maxOutputBytes),
  };
}

function runNodeProcess(
  request: ProcessRequest,
  options: ProcessRunOptions,
  spawnChild: SpawnProcess,
  maxOutputBytes: number,
): Promise<ProcessResult> {
  if (options.signal?.aborted === true) return Promise.reject(new ProcessCancelledError());

  return new Promise((resolve, reject) => {
    const child = spawnChild(request.executablePath, request.arguments, {
      cwd: request.cwd,
      env: process.env,
      shell: false,
      windowsHide: true,
    });
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let settled = false;

    const cleanup = (): void => {
      options.signal?.removeEventListener('abort', cancel);
    };
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      cleanup();
      child.kill();
      reject(
        error instanceof Error ? error : new Error('The process runner failed.', { cause: error }),
      );
    };
    const cancel = (): void => {
      fail(new ProcessCancelledError());
    };
    const append = (stream: 'stdout' | 'stderr', buffer: Buffer): void => {
      if (settled) return;
      outputBytes += buffer.byteLength;
      if (outputBytes > maxOutputBytes) {
        fail(new ProcessOutputLimitError());
        return;
      }
      const text = stream === 'stdout' ? stdoutDecoder.write(buffer) : stderrDecoder.write(buffer);
      if (stream === 'stdout') stdout += text;
      else stderr += text;
      try {
        options.onChunk?.({ stream, text });
      } catch (error) {
        fail(error);
      }
    };

    options.signal?.addEventListener('abort', cancel, { once: true });
    child.stdout.on('data', (buffer: Buffer) => {
      append('stdout', buffer);
    });
    child.stderr.on('data', (buffer: Buffer) => {
      append('stderr', buffer);
    });
    child.once('error', (error) => {
      fail(
        options.signal?.aborted === true
          ? new ProcessCancelledError()
          : new ProcessStartError(error),
      );
    });
    child.once('close', (exitCode, signal) => {
      if (settled) return;
      const finalStdout = stdoutDecoder.end();
      const finalStderr = stderrDecoder.end();
      try {
        if (finalStdout !== '') options.onChunk?.({ stream: 'stdout', text: finalStdout });
        if (finalStderr !== '') options.onChunk?.({ stream: 'stderr', text: finalStderr });
      } catch (error) {
        fail(error);
        return;
      }
      settled = true;
      cleanup();
      resolve({
        exitCode,
        signal,
        stdout: stdout + finalStdout,
        stderr: stderr + finalStderr,
      });
    });
  });
}
