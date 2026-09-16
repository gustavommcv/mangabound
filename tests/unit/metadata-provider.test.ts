import { describe, expect, it, vi } from 'vitest';

import { ExternalMetadataProvider } from '@/adapters/external-metadata/metadata-provider';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function textResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as Response;
}

describe('External metadata provider', () => {
  it('searches by title with a real user-agent header and maps results, preferring English titles', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse(200, {
          data: [
            { id: 'work-1', type: 'manga', attributes: { title: { en: 'A Quiet Journey' } } },
            { id: 'work-2', type: 'manga', attributes: { title: { ja: '静かな旅' } } },
          ],
        }),
      ),
    );
    const provider = new ExternalMetadataProvider(fetchImpl);

    const results = await provider.search('quiet journey');

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://api.external-metadata.org/manga?title=quiet%20journey&limit=10',
    );
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({
      'User-Agent': 'Mangabound (+https://github.com/gustavommcv/mangabound)',
    });
    expect(results).toEqual([
      { id: 'work-1', title: 'A Quiet Journey', provider: 'External API' },
      { id: 'work-2', title: '静かな旅', provider: 'External API' },
    ]);
  });

  it('falls back to the manga id when a result has no title in any language', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse(200, {
          data: [{ id: 'work-3', type: 'manga', attributes: { title: {} } }],
        }),
      ),
    );
    const provider = new ExternalMetadataProvider(fetchImpl);

    await expect(provider.search('x')).resolves.toEqual([
      { id: 'work-3', title: 'work-3', provider: 'External API' },
    ]);
  });

  it('forwards an AbortSignal to the underlying fetch call', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse(200, { volumes: {} })),
    );
    const provider = new ExternalMetadataProvider(fetchImpl);
    const controller = new AbortController();

    await provider.suggestVolumes('work-1', controller.signal);

    expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it('flattens the volume aggregate into numeric suggestions, dropping non-numeric groups', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse(200, {
          volumes: {
            '1': { volume: '1', chapters: { a: { chapter: '1' }, b: { chapter: '2' } } },
            none: { volume: 'none', chapters: { c: { chapter: 'none' } } },
          },
        }),
      ),
    );
    const provider = new ExternalMetadataProvider(fetchImpl);

    const { volumes } = await provider.suggestVolumes('work-1');

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.external-metadata.org/manga/work-1/aggregate?translatedLanguage[]=en',
      expect.anything(),
    );
    expect(volumes).toEqual([{ number: '1', chapterNumbers: [1, 2] }]);
  });

  it('drops a numeric volume whose chapters are all non-numeric', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse(200, {
          volumes: { '1': { volume: '1', chapters: { a: { chapter: 'none' } } } },
        }),
      ),
    );
    const provider = new ExternalMetadataProvider(fetchImpl);

    await expect(provider.suggestVolumes('work-1')).resolves.toEqual({ volumes: [] });
  });

  it('throws invalid_payload for a well-formed but unexpected aggregate response', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse(200, { unexpected: true })),
    );
    const provider = new ExternalMetadataProvider(fetchImpl);

    await expect(provider.suggestVolumes('work-1')).rejects.toMatchObject({
      code: 'invalid_payload',
    });
  });

  it('treats an empty array in place of a keyed collection as no volumes', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse(200, { volumes: [] })),
    );
    const provider = new ExternalMetadataProvider(fetchImpl);

    await expect(provider.suggestVolumes('work-1')).resolves.toEqual({ volumes: [] });
  });

  it('throws a recoverable rate-limit error on 429', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(textResponse(429, '')));
    const provider = new ExternalMetadataProvider(fetchImpl);

    await expect(provider.search('x')).rejects.toMatchObject({
      code: 'rate_limited',
      recoverable: true,
    });
  });

  it('throws a recoverable http error on other non-2xx statuses', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(textResponse(500, '')));
    const provider = new ExternalMetadataProvider(fetchImpl);

    await expect(provider.search('x')).rejects.toMatchObject({ code: 'http_error' });
  });

  it('throws on malformed JSON and on a well-formed but unexpected payload', async () => {
    const malformed = new ExternalMetadataProvider(
      vi.fn<typeof fetch>(() => Promise.resolve(textResponse(200, 'not json'))),
    );
    await expect(malformed.search('x')).rejects.toMatchObject({ code: 'malformed_json' });

    const unexpected = new ExternalMetadataProvider(
      vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse(200, { unexpected: true }))),
    );
    await expect(unexpected.search('x')).rejects.toMatchObject({ code: 'invalid_payload' });
  });

  it('wraps a network failure and passes an abort through unwrapped', async () => {
    const networkFailure = new ExternalMetadataProvider(
      vi.fn<typeof fetch>(() => Promise.reject(new Error('DNS lookup failed'))),
    );
    await expect(networkFailure.search('x')).rejects.toMatchObject({ code: 'network_error' });

    const abortError = Object.assign(new Error('The operation was aborted.'), {
      name: 'AbortError',
    });
    const aborted = new ExternalMetadataProvider(
      vi.fn<typeof fetch>(() => Promise.reject(abortError)),
    );
    await expect(aborted.search('x')).rejects.toBe(abortError);
  });
});
