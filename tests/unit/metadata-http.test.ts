import { describe, expect, it, vi } from 'vitest';

import { MetadataProviderError } from '@/adapters/metadata-providers/errors';
import { requestText, userAgent } from '@/adapters/metadata-providers/http';

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
    });
    // A real, identifiable agent that says where the app lives, never a borrowed browser's.
    expect(userAgent).toMatch(/^Mangabound \(\+https:\/\/github\.com\//u);
  });

  it('hands the abort signal to the request', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(respond(200)));
    const controller = new AbortController();

    await requestText(fetchImpl, {
      url: 'https://x.test',
      serviceName: 'Example',
      signal: controller.signal,
    });

    expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
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
});
