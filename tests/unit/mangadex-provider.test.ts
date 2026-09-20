import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { MetadataProviderError } from '@/adapters/metadata-providers/errors';
import { userAgent } from '@/adapters/metadata-providers/http';
import {
  MangaDexProvider,
  mangaDexDescriptor,
} from '@/adapters/metadata-providers/mangadex/provider';

const fixture = (name: string): string =>
  readFileSync(path.resolve('tests', 'fixtures', 'metadata', 'mangadex', name), 'utf8');

function respond(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as Response;
}

const work = 'a77742b1-befd-49a4-bff5-1ad4e6b0ef7b';

/** The address a request was made to, whichever form fetch was given it in. */
const urlOf = (input: string | URL | Request | undefined): string =>
  typeof input === 'string' || input === undefined
    ? (input ?? '')
    : input instanceof URL
      ? input.href
      : input.url;

describe('MangaDex provider', () => {
  it('names itself, its site and what it is, for the list of sources and the credit', () => {
    expect(new MangaDexProvider(vi.fn<typeof fetch>()).descriptor).toEqual({
      id: 'mangadex',
      displayName: 'MangaDex',
      homepage: 'https://mangadex.org',
      description: 'Community catalogue of manga, with volume and chapter data',
    });
    expect(mangaDexDescriptor.homepage.startsWith('https://')).toBe(true);
  });

  describe('searching', () => {
    it('asks for the works matching a title, most relevant first, with a real user agent', async () => {
      const fetchImpl = vi.fn<typeof fetch>(() =>
        Promise.resolve(respond(200, fixture('search-chainsaw-man.json'))),
      );

      await new MangaDexProvider(fetchImpl).search('Chainsaw Man');

      expect(fetchImpl.mock.calls[0]?.[0]).toBe(
        'https://api.mangadex.org/manga?title=Chainsaw%20Man&limit=10&order%5Brelevance%5D=desc',
      );
      expect(fetchImpl.mock.calls[0]?.[1]?.headers).toEqual({
        'User-Agent': userAgent,
        Accept: 'application/json',
      });
    });

    it('turns a real response into results, naming each by the language its title has', async () => {
      const results = await new MangaDexProvider(() =>
        Promise.resolve(respond(200, fixture('search-chainsaw-man.json'))),
      ).search('Chainsaw Man');

      expect(results).toEqual([
        // Only a romanized Japanese title: the first title there is is used.
        { id: work, title: 'Chainsaw Man', provider: 'mangadex' },
        {
          id: 'e896c48c-3150-437d-ba57-d8567eb399ae',
          title: 'Chainsaw Man (Official Colored)',
          provider: 'mangadex',
        },
        {
          id: '268f5da0-d158-4c95-bc2b-b4d962c2f325',
          title: 'Chainsaw Man - The Hayakawa Family (Doujinshi)',
          provider: 'mangadex',
        },
      ]);
    });

    it('prefers the English title, and falls back to the id when a work has none at all', async () => {
      const body = JSON.stringify({
        data: [
          {
            id: 'w1',
            type: 'manga',
            attributes: { title: { ja: '静かな旅', en: 'A Quiet Journey' } },
          },
          { id: 'w2', type: 'manga', attributes: { title: {} } },
        ],
      });

      const results = await new MangaDexProvider(() => Promise.resolve(respond(200, body))).search(
        'x',
      );

      expect(results.map((result) => result.title)).toEqual(['A Quiet Journey', 'w2']);
    });

    it('passes the abort signal on to the request', async () => {
      const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(respond(200, '{"data":[]}')));
      const controller = new AbortController();

      await new MangaDexProvider(fetchImpl).search('x', controller.signal);

      expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    });
  });

  describe('asking for the volumes of a work', () => {
    const englishAndPortuguese = (url: string | URL | Request): Promise<Response> =>
      Promise.resolve(
        respond(
          200,
          fixture(urlOf(url).includes('pt-br') ? 'aggregate-pt-br.json' : 'aggregate-en.json'),
        ),
      );

    it('asks in the language the folders declare, and reads the volumes of that translation', async () => {
      const fetchImpl = vi.fn<typeof fetch>(englishAndPortuguese);

      const { volumes } = await new MangaDexProvider(fetchImpl).suggestVolumes(work, {
        language: 'pt-br',
      });

      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(fetchImpl.mock.calls[0]?.[0]).toBe(
        `https://api.mangadex.org/manga/${work}/aggregate?translatedLanguage%5B%5D=pt-br`,
      );
      expect(volumes.map((volume) => volume.number)).toEqual(['1', '2', '3']);
      expect(volumes[0]?.chapterNumbers).toEqual([1, 2, 3, 4]);
    });

    it('asks in English when the folders declare no language', async () => {
      const fetchImpl = vi.fn<typeof fetch>(englishAndPortuguese);

      const { volumes } = await new MangaDexProvider(fetchImpl).suggestVolumes(work);

      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(urlOf(fetchImpl.mock.calls[0]?.[0])).toContain('translatedLanguage%5B%5D=en');
      expect(volumes).toHaveLength(3);
    });

    it('does not ask twice for English, and lower-cases the language it was given', async () => {
      const fetchImpl = vi.fn<typeof fetch>(englishAndPortuguese);

      await new MangaDexProvider(fetchImpl).suggestVolumes(work, { language: 'EN' });

      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(urlOf(fetchImpl.mock.calls[0]?.[0])).toContain('translatedLanguage%5B%5D=en');
    });

    it('tries English when the declared language has no volumes, and gives up after that', async () => {
      const empty = JSON.stringify({ result: 'ok', volumes: [] });
      const fetchImpl = vi.fn<typeof fetch>((url) =>
        Promise.resolve(
          respond(200, urlOf(url).includes('=en') ? fixture('aggregate-en.json') : empty),
        ),
      );

      const found = await new MangaDexProvider(fetchImpl).suggestVolumes(work, { language: 'fr' });

      expect(fetchImpl.mock.calls.map(([url]) => urlOf(url).split('=').at(-1))).toEqual([
        'fr',
        'en',
      ]);
      expect(found.volumes).toHaveLength(3);

      const none = await new MangaDexProvider(() =>
        Promise.resolve(respond(200, empty)),
      ).suggestVolumes(work, { language: 'fr' });
      expect(none.volumes).toEqual([]);
    });

    it('leaves out the chapters MangaDex has put in no volume, and volumes with no chapter numbers', async () => {
      const body = JSON.stringify({
        result: 'ok',
        volumes: {
          '1': {
            volume: '1',
            count: 2,
            chapters: { '1': { chapter: '1' }, '2': { chapter: '2' } },
          },
          '2': { volume: '2', count: 1, chapters: { oneshot: { chapter: 'oneshot' } } },
          '3': { volume: '3', count: 0, chapters: [] },
          none: { volume: 'none', count: 1, chapters: { '9': { chapter: '9' } } },
        },
      });

      const { volumes } = await new MangaDexProvider(() =>
        Promise.resolve(respond(200, body)),
      ).suggestVolumes(work);

      expect(volumes).toEqual([{ number: '1', chapterNumbers: [1, 2] }]);
    });

    it('passes the abort signal on to the request', async () => {
      const fetchImpl = vi.fn<typeof fetch>(englishAndPortuguese);
      const controller = new AbortController();

      await new MangaDexProvider(fetchImpl).suggestVolumes(work, { signal: controller.signal });

      expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    });
  });

  describe('when the service cannot be used', () => {
    const provider = (respondWith: () => Promise<Response>) =>
      new MangaDexProvider(vi.fn<typeof fetch>(respondWith));

    it.each([
      [
        'cannot be reached',
        () => Promise.reject(new TypeError('fetch failed')),
        'network_error',
        'Could not reach MangaDex.',
      ],
      [
        'is rate-limiting',
        () => Promise.resolve(respond(429, '')),
        'rate_limited',
        'MangaDex is rate-limiting requests. Try again shortly.',
      ],
      [
        'answers with an error',
        () => Promise.resolve(respond(503, '')),
        'http_error',
        'MangaDex returned an unexpected status (503).',
      ],
      [
        'answers with something that is not JSON',
        () => Promise.resolve(respond(200, '<html>')),
        'malformed_json',
        'MangaDex returned malformed JSON.',
      ],
    ])('says so, naming the service, when it %s', async (_name, respondWith, code, message) => {
      for (const ask of [
        () => provider(respondWith).search('x'),
        () => provider(respondWith).suggestVolumes(work),
      ]) {
        await expect(ask()).rejects.toMatchObject({
          name: 'MetadataProviderError',
          code,
          message,
          recoverable: true,
        });
      }
    });

    it('says so when a response has an unexpected shape', async () => {
      await expect(
        provider(() => Promise.resolve(respond(200, '{"data":[{"id":1}]}'))).search('x'),
      ).rejects.toMatchObject({
        code: 'invalid_payload',
        message: 'MangaDex returned an unexpected search response.',
      });
      await expect(
        provider(() => Promise.resolve(respond(200, '{"volumes":7}'))).suggestVolumes(work),
      ).rejects.toMatchObject({
        code: 'invalid_payload',
        message: 'MangaDex returned an unexpected volumes response.',
      });
    });

    it('lets a cancelled request through as the cancellation it is', async () => {
      const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });

      await expect(provider(() => Promise.reject(aborted)).search('x')).rejects.toBe(aborted);
      await expect(provider(() => Promise.reject(aborted)).search('x')).rejects.not.toBeInstanceOf(
        MetadataProviderError,
      );
    });
  });
});
