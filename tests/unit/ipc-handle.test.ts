import type { IpcMainInvokeEvent } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { handle, ignoredPayloadSchema } from '@/main/ipc/handle';
import { failed, ok } from '@/main/ipc/result';
import type { WorkflowResult } from '@/shared/workflow-contract';

const listeners = vi.hoisted(
  () =>
    new Map<
      string,
      (event: IpcMainInvokeEvent, payload: unknown) => Promise<WorkflowResult<unknown>>
    >(),
);
vi.mock('electron', () => ({
  ipcMain: {
    handle: (
      channel: string,
      listener: (event: IpcMainInvokeEvent, payload: unknown) => Promise<WorkflowResult<unknown>>,
    ) => {
      listeners.set(channel, listener);
    },
  },
}));

// The event is opaque to the helper; tests verify it is forwarded, not rebuilt.
const event = {} as IpcMainInvokeEvent;
const invoke = (payload: unknown) => listeners.get('test:request')!(event, payload);

afterEach(() => {
  listeners.clear();
  vi.restoreAllMocks();
});

describe('IPC handle', () => {
  it('registers the channel and passes only parsed data, with the original event', async () => {
    const run = vi.fn((_event, command: { name: string }) => ok(command.name));
    handle('test:request', z.object({ name: z.string().trim() }), run);

    expect(await invoke({ name: ' Volume 1 ', extra: 'not trusted' })).toEqual(ok('Volume 1'));
    expect(run).toHaveBeenCalledExactlyOnceWith(event, { name: 'Volume 1' });
  });

  it('rejects malformed payloads before executing and logs the rejected request', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const run = vi.fn(() => ok(undefined));
    handle('test:request', z.string().min(1), run);

    expect(await invoke(42)).toEqual(
      failed({
        code: 'invalid_request',
        message: 'Mangabound rejected an invalid workflow request.',
      }),
    );
    expect(run).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('invalid_request'),
      expect.any(z.ZodError),
    );
  });

  it('keeps an explicit domain failure without remapping or logging it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = failed({ code: 'job_exists', message: 'Already running.' });
    handle('test:request', ignoredPayloadSchema, () => result);

    expect(await invoke(undefined)).toBe(result);
    expect(logged).not.toHaveBeenCalled();
  });

  it.each(['throw', 'reject'] as const)(
    'catches an unexpected %s and logs its cause',
    async (kind) => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const cause = new TypeError('private implementation detail');
      handle('test:request', ignoredPayloadSchema, () => {
        if (kind === 'throw') throw cause;
        return Promise.reject(cause);
      });

      expect(await invoke(undefined)).toEqual(
        failed({
          code: 'internal_error',
          message: 'Mangabound could not complete that action.',
        }),
      );
      expect(logged).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining('internal_error'),
        cause,
      );
    },
  );

  it('awaits success and preserves no-payload commands ignoring extra arguments', async () => {
    handle('test:request', ignoredPayloadSchema, () => Promise.resolve(ok('ready')));
    expect(await invoke({ ignored: true })).toEqual(ok('ready'));
  });

  it('allows a command-specific failure mapping for parse and execution failures', async () => {
    const failure = { code: 'pending_delete_failed', message: 'Try again.' };
    const mapFailure = vi.fn(() => failure);
    const cause = new Error('storage');
    const run = vi.fn(() => Promise.reject(cause));
    handle('test:request', z.string(), run, mapFailure);

    expect(await invoke(null)).toEqual(failed(failure));
    expect(run).not.toHaveBeenCalled();
    expect(mapFailure).toHaveBeenLastCalledWith(expect.any(z.ZodError));
    expect(await invoke('run')).toEqual(failed(failure));
    expect(mapFailure).toHaveBeenLastCalledWith(cause);
  });
});
