import { describe, expect, it, vi } from 'vitest';

import { createMetadataProviders } from '@/adapters/external-metadata/registry';
import {
  searchMetadataCommandSchema,
  suggestVolumesCommandSchema,
} from '@/shared/workflow-contract';

describe('metadata provider registry', () => {
  it('offers nothing until a provider is configured, so a fresh install has no lookup to fail', () => {
    expect(createMetadataProviders({})).toEqual([]);
    expect(createMetadataProviders({ METADATA_API_BASE_URL: undefined })).toEqual([]);
    expect(createMetadataProviders({ METADATA_API_BASE_URL: '' })).toEqual([]);
    expect(createMetadataProviders({ METADATA_API_BASE_URL: '   ' })).toEqual([]);
  });

  it('registers the external provider against the configured base URL', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ data: [] })),
      } as Response),
    );

    const providers = createMetadataProviders(
      { METADATA_API_BASE_URL: ' https://metadata.example.test ' },
      fetchImpl,
    );

    expect(providers).toHaveLength(1);
    expect(providers[0]?.descriptor).toEqual({ id: 'external', displayName: 'External API' });
    await providers[0]?.search('A Title');
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://metadata.example.test/manga?title=A%20Title&limit=10',
    );
  });

  it('uses the global fetch when none is supplied', () => {
    const providers = createMetadataProviders({ METADATA_API_BASE_URL: 'https://x.example.test' });

    expect(providers.map((provider) => provider.descriptor.id)).toEqual(['external']);
  });
});

describe('metadata IPC commands', () => {
  const jobId = '6f1b1a2e-3c4d-4e5f-8a9b-0c1d2e3f4a5b';

  it('names the provider on both commands and keeps the work id apart from it', () => {
    expect(
      searchMetadataCommandSchema.parse({ jobId, providerId: 'external', title: 'A Title' }),
    ).toEqual({ jobId, providerId: 'external', title: 'A Title' });
    expect(
      suggestVolumesCommandSchema.parse({ jobId, providerId: 'external', workId: 'work-1' }),
    ).toEqual({ jobId, providerId: 'external', workId: 'work-1' });
  });

  it('rejects a command that omits the provider or the work', () => {
    expect(searchMetadataCommandSchema.safeParse({ jobId, title: 'A Title' }).success).toBe(false);
    expect(suggestVolumesCommandSchema.safeParse({ jobId, providerId: 'external' }).success).toBe(
      false,
    );
    expect(suggestVolumesCommandSchema.safeParse({ jobId, workId: 'work-1' }).success).toBe(false);
  });
});
