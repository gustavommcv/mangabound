import { describe, expect, it } from 'vitest';

import { createMetadataProviders } from '@/adapters/metadata-providers/registry';
import {
  languageTagSchema,
  openProviderHomepageCommandSchema,
  searchMetadataCommandSchema,
  suggestVolumesCommandSchema,
} from '@/shared/workflow-contract';

describe('metadata provider registry', () => {
  const providers = createMetadataProviders();

  it('offers MangaDex first, and lists every source it offers by a stable id', () => {
    expect(providers.map((provider) => provider.descriptor.id)).toEqual(['mangadex']);
  });

  // These are the rules a new provider has to meet to be listed (docs/adding-a-metadata-provider.md).
  describe.each(
    providers.map((provider) => [provider.descriptor.id, provider.descriptor] as const),
  )('the descriptor of %s', (_id, descriptor) => {
    it('has a lowercase id the interface and the IPC contract can refer to it by', () => {
      expect(descriptor.id).toMatch(/^[a-z][a-z0-9-]*$/u);
    });

    it('names the service, and says what it is, for the person choosing a source', () => {
      expect(descriptor.displayName.trim()).not.toBe('');
      expect(descriptor.description.trim()).not.toBe('');
    });

    it('gives the service’s own site over https, which is what the credit opens', () => {
      const homepage = new URL(descriptor.homepage);
      expect(homepage.protocol).toBe('https:');
      expect(homepage.username + homepage.password).toBe('');
    });
  });

  it('lists each id once', () => {
    const ids = providers.map((provider) => provider.descriptor.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('builds the same list whether or not a fetch is supplied', () => {
    expect(
      createMetadataProviders(() => Promise.reject(new Error('unused'))).map(
        (provider) => provider.descriptor,
      ),
    ).toEqual(providers.map((provider) => provider.descriptor));
  });
});

describe('metadata IPC commands', () => {
  const jobId = '6f1b1a2e-3c4d-4e5f-8a9b-0c1d2e3f4a5b';

  it('names the provider on both commands and keeps the work id apart from it', () => {
    expect(
      searchMetadataCommandSchema.parse({ jobId, providerId: 'mangadex', title: 'A Title' }),
    ).toEqual({ jobId, providerId: 'mangadex', title: 'A Title' });
    expect(
      suggestVolumesCommandSchema.parse({ jobId, providerId: 'mangadex', workId: 'work-1' }),
    ).toEqual({ jobId, providerId: 'mangadex', workId: 'work-1' });
  });

  it('carries the language the folders declare, and only a language', () => {
    const command = { jobId, providerId: 'mangadex', workId: 'work-1' };

    expect(suggestVolumesCommandSchema.parse({ ...command, language: 'pt-br' }).language).toBe(
      'pt-br',
    );
    for (const bad of ['', 'x', 'pt br', 'pt-br/../x', '<script>', 'a'.repeat(21), 'pt_br']) {
      expect(suggestVolumesCommandSchema.safeParse({ ...command, language: bad }).success).toBe(
        false,
      );
    }
  });

  it.each(['en', 'pt-br', 'es-la', 'zh-hk', 'ja-ro', 'EN'])(
    'takes %s for a language tag',
    (tag) => {
      expect(languageTagSchema.safeParse(tag).success).toBe(true);
    },
  );

  it('rejects a command that omits the provider or the work', () => {
    expect(searchMetadataCommandSchema.safeParse({ jobId, title: 'A Title' }).success).toBe(false);
    expect(suggestVolumesCommandSchema.safeParse({ jobId, providerId: 'mangadex' }).success).toBe(
      false,
    );
    expect(suggestVolumesCommandSchema.safeParse({ jobId, workId: 'work-1' }).success).toBe(false);
  });

  it('opens a source’s site by naming the source, never by giving an address', () => {
    expect(
      openProviderHomepageCommandSchema.parse({
        providerId: 'mangadex',
        url: 'https://evil.example',
      }),
    ).toEqual({ providerId: 'mangadex' });
    expect(
      openProviderHomepageCommandSchema.safeParse({ url: 'https://evil.example' }).success,
    ).toBe(false);
    expect(openProviderHomepageCommandSchema.safeParse({ providerId: '' }).success).toBe(false);
  });
});
