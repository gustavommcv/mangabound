import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { z } from 'zod';

import { CliProtocolError } from '@/adapters/cli-protocol-error';
import { MetadataProviderError } from '@/adapters/metadata-providers/errors';
import { ProcessCancelledError } from '@/application/ports/process-runner';
import { SettingsSaveError } from '@/application/ports/settings-store';
import { ConversionWorkflowError, ToolExecutionError } from '@/domain/conversion';
import { LibraryIndexError } from '@/library/manifest';
import { opdsPort } from '@/main/constants';
import { toFailure } from '@/main/ipc/result';
import { sharingFailure } from '@/main/ipc/sharing-failure';

const systemError = (code: string): Error =>
  Object.assign(new Error(`${code}: the system said no`), { code });

let logged: MockInstance<typeof console.error>;

beforeEach(() => {
  logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  logged.mockRestore();
});

describe('toFailure', () => {
  it('keeps the message and the issue of a tool failure, and logs nothing', () => {
    const issue = {
      tool: 'mangapress',
      severity: 'error',
      code: 'conversion_failed',
      stage: 'convert',
      recoverable: false,
      message: 'mangapress could not read the page.',
      diagnostic: 'page 3 is not an image',
    } as const;

    expect(toFailure(new ToolExecutionError(issue, 2))).toEqual({
      code: 'conversion_failed',
      message: 'mangapress could not read the page.',
      issue,
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it('reports a cancellation as one, however it was raised, and logs nothing', () => {
    const aborted = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });

    expect(toFailure(new ProcessCancelledError())).toEqual({
      code: 'cancelled',
      message: 'Conversion cancelled.',
    });
    expect(toFailure(aborted)).toEqual({ code: 'cancelled', message: 'Cancelled.' });
    expect(logged).not.toHaveBeenCalled();
  });

  it('keeps the message of a workflow error, and logs it only when it carries a cause', () => {
    expect(toFailure(new ConversionWorkflowError('no_volumes', 'No volumes.'))).toEqual({
      code: 'no_volumes',
      message: 'No volumes.',
    });
    expect(logged).not.toHaveBeenCalled();

    const withCause = new ConversionWorkflowError('publish_failed', 'Could not write the book.', {
      cause: systemError('ENOSPC'),
    });

    expect(toFailure(withCause)).toEqual({
      code: 'publish_failed',
      message: 'Could not write the book.',
    });
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('publish_failed'), withCause);
  });

  it('keeps the message of a provider error, and logs it only when it carries a cause', () => {
    expect(
      toFailure(new MetadataProviderError('timeout', 'The source did not answer.', true)),
    ).toEqual({ code: 'timeout', message: 'The source did not answer.' });
    expect(logged).not.toHaveBeenCalled();

    const withCause = new MetadataProviderError(
      'network_error',
      'The source is unreachable.',
      true,
      {
        cause: new TypeError('fetch failed'),
      },
    );

    expect(toFailure(withCause)).toEqual({
      code: 'network_error',
      message: 'The source is unreachable.',
    });
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('network_error'), withCause);
  });

  it.each([
    {
      name: 'an unreadable catalog',
      error: new LibraryIndexError('invalid_manifest', 'The catalog names a path outside.'),
      failure: {
        code: 'invalid_manifest',
        message: 'The output library catalog could not be read.',
      },
    },
    {
      name: 'settings that could not be saved',
      error: new SettingsSaveError({ cause: systemError('EBUSY') }),
      failure: { code: 'settings_save_failed', message: 'Your settings could not be saved.' },
    },
    {
      name: 'data a tool should not have sent',
      error: new CliProtocolError('invalid_payload', 'Expected a number at volumes[2].'),
      failure: {
        code: 'invalid_payload',
        message:
          'A bundled conversion tool returned incompatible data. Reinstall Mangabound or open Diagnostics.',
      },
    },
    {
      name: 'a request the page should not have sent',
      error: z.object({ jobId: z.string() }).safeParse({}).error!,
      failure: {
        code: 'invalid_request',
        message: 'Mangabound rejected an invalid workflow request.',
      },
    },
  ])(
    'tells the person something short about $name and logs the real error',
    ({ error, failure }) => {
      expect(toFailure(error)).toEqual(failure);
      expect(logged).toHaveBeenCalledOnce();
      expect(logged).toHaveBeenCalledWith(expect.stringContaining(failure.code), error);
    },
  );

  it.each(['EACCES', 'EPERM', 'EROFS'])(
    'says a file or folder could not be used for %s, not that the network failed',
    (code) => {
      const error = systemError(code);

      const failure = toFailure(error);

      expect(failure.code).toBe('file_access_denied');
      expect(failure.message).toContain('permissions');
      expect(failure.message).not.toMatch(/sharing|network/iu);
      expect(logged).toHaveBeenCalledWith(expect.stringContaining('file_access_denied'), error);
    },
  );

  it('says the drive is full for ENOSPC', () => {
    const error = systemError('ENOSPC');

    expect(toFailure(error)).toEqual({
      code: 'disk_full',
      message: 'There is no space left on the drive. Free some space and try again.',
    });
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('disk_full'), error);
  });

  it('does not treat the errors of a listening socket as anything it knows', () => {
    expect(toFailure(systemError('EADDRINUSE')).code).toBe('internal_error');
    expect(toFailure(systemError('EADDRNOTAVAIL')).code).toBe('internal_error');
  });

  it('logs an error nobody expected, with its stack, and tells the person only that it failed', () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'path')");

    expect(toFailure(bug)).toEqual({
      code: 'internal_error',
      message: 'Mangabound could not complete that action.',
    });
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('internal_error'), bug);
  });

  it('handles something that is not an Error at all', () => {
    expect(toFailure('boom')).toEqual({
      code: 'internal_error',
      message: 'Mangabound could not complete that action.',
    });
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('internal_error'), 'boom');
  });
});

describe('sharingFailure', () => {
  it('names the port when it is already in use', () => {
    const failure = sharingFailure(systemError('EADDRINUSE'));

    expect(failure?.code).toBe('sharing_failed');
    expect(failure?.message).toContain(String(opdsPort));
    expect(failure?.message).toContain('already used by another program');
  });

  it.each(['EADDRNOTAVAIL', 'EACCES'])('says the address was not usable for %s', (code) => {
    expect(sharingFailure(systemError(code))).toEqual({
      code: 'sharing_failed',
      message: 'The sharing server could not be started on that network address.',
    });
  });

  it.each([
    ['another system error', systemError('ENOENT')],
    ['an error with no code', new Error('boom')],
    ['something that is not an error', 'EADDRINUSE'],
  ])('leaves %s to the general mapping', (_name, error) => {
    expect(sharingFailure(error)).toBeUndefined();
  });
});
