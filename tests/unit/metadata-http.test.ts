import { describe, expect, it, vi } from 'vitest';

import { MetadataProviderError } from '@/adapters/metadata-providers/errors';
import { requestText, requestTimeoutMs, userAgent } from '@/adapters/metadata-providers/http';

const respond = (status: number, body = ''): Response =>
  ({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) }) as Response;

describe('the request every metadata provider goes through', () => {
  it('reads the answer as text, saying who is asking', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(respond(200, '{"ok":true}')));

    await expect(
      requestText(fetchImpl, { url: 'https://api.example.test/x', serviceName: 'Example' }),
    ).resolves.toBe('{"ok":true}');

    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.test/x', {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: expect.any(AbortSignal) as AbortSignal,
    });
    // A real, identifiable agent that says where the app lives, never a borrowed browser's.
    expect(userAgent).toMatch(/^Mangabound \(\+https:\/\/github\.com\//u);
  });

  it('stops the request when the caller cancels, as well as when it times out', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(respond(200)));
    const controller = new AbortController();

    await requestText(fetchImpl, {
      url: 'https://x.test',
      serviceName: 'Example',
      signal: controller.signal,
    });

    const sent = fetchImpl.mock.calls[0]?.[1]?.signal;
    expect(sent?.aborted).toBe(false);
    controller.abort();
    expect(sent?.aborted).toBe(true);
  });

  it.each([
    [() => Promise.reject(new TypeError('offline')), 'network_error', 'Could not reach Example.'],
    [
      () => Promise.resolve(respond(429)),
      'rate_limited',
      'Example is rate-limiting requests. Try again shortly.',
    ],
    [
      () => Promise.resolve(respond(500)),
      'http_error',
      'Example returned an unexpected status (500).',
    ],
  ])('fails with the service named in the message', async (answer, code, message) => {
    await expect(
      requestText(vi.fn<typeof fetch>(answer), { url: 'https://x.test', serviceName: 'Example' }),
    ).rejects.toMatchObject({ code, message, recoverable: true });
  });

  it('keeps the cause of a network failure, and lets a cancellation through untouched', async () => {
    const cause = new TypeError('offline');
    const failure = await requestText(
      vi.fn<typeof fetch>(() => Promise.reject(cause)),
      { url: 'https://x.test', serviceName: 'Example' },
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MetadataProviderError);
    expect((failure as Error).cause).toBe(cause);

    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });
    await expect(
      requestText(
        vi.fn<typeof fetch>(() => Promise.reject(aborted)),
        {
          url: 'https://x.test',
          serviceName: 'Example',
        },
      ),
    ).rejects.toBe(aborted);
  });

  describe('a service that does not answer', () => {
    /** What fails the way fetch does when it is stopped: with the reason it was stopped for. */
    const whenStopped = <T>(signal: AbortSignal | null | undefined): Promise<T> =>
      new Promise<T>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(signal.reason as Error);
        });
      });

    /** A fetch that says nothing until it is stopped. */
    const silentFetch = (): typeof fetch => (_url, init) => whenStopped(init?.signal);

    it('is given up on after the timeout, and reported as not answering in time', async () => {
      const failure = await requestText(silentFetch(), {
        url: 'https://x.test',
        serviceName: 'Example',
        timeoutMs: 10,
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(MetadataProviderError);
      expect(failure).toMatchObject({
        code: 'timeout',
        message: 'Example did not answer in time. Try again shortly.',
        recoverable: true,
      });
    });

    it('is given up on too when the answer starts and its body never finishes', async () => {
      const stalled: typeof fetch = (_url, init) =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => whenStopped(init?.signal),
        } as Response);

      await expect(
        requestText(stalled, { url: 'https://x.test', serviceName: 'Example', timeoutMs: 10 }),
      ).rejects.toMatchObject({ code: 'timeout' });
    });

    it('waits for the answer for fifteen seconds by default', async () => {
      const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(respond(200, 'ok')));
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');

      await requestText(fetchImpl, { url: 'https://x.test', serviceName: 'Example' });

      expect(timeoutSpy).toHaveBeenCalledWith(15_000);
      expect(requestTimeoutMs).toBe(15_000);
      timeoutSpy.mockRestore();
    });

    it('lets a cancellation through as a cancellation, not as a timeout', async () => {
      const controller = new AbortController();
      const pending = requestText(silentFetch(), {
        url: 'https://x.test',
        serviceName: 'Example',
        signal: controller.signal,
        timeoutMs: 5_000,
      }).catch((error: unknown) => error);

      controller.abort();

      const failure = await pending;
      expect(failure).not.toBeInstanceOf(MetadataProviderError);
      expect(failure).toMatchObject({ name: 'AbortError' });
    });

    it('reports a body that fails to arrive as the service being unreachable', async () => {
      const cause = new TypeError('connection reset');
      const broken = vi.fn<typeof fetch>(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.reject(cause),
        } as Response),
      );

      const failure = await requestText(broken, {
        url: 'https://x.test',
        serviceName: 'Example',
      }).catch((error: unknown) => error);

      expect(failure).toMatchObject({ code: 'network_error', message: 'Could not reach Example.' });
      expect((failure as Error).cause).toBe(cause);
    });
  });
});
