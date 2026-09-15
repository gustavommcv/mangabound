import { describe, expect, it, vi } from 'vitest';

import type { BindingPort, ConversionPort } from '@/application/ports/conversion-tools';
import { SingleInputWorkflow } from '@/application/workflows/single-input';
import type { ConversionArtifact, InputSelection } from '@/domain/conversion';
import { createMappingDraft, type MappingDraft } from '@/domain/mapping';
import { defaultMangapressSettings } from '@/domain/output-profile';

const trustedDraft = createMappingDraft({
  mangaTitle: 'Trusted Manga',
  chapters: [
    { id: 'c1', name: 'Chapter 1', path: '/trusted/c1', pageCount: 2, chapter: 1 },
    { id: 'c2', name: 'Chapter 2', path: '/trusted/c2', pageCount: 3, chapter: 2 },
  ],
});

function mappedDraft(overrides: Partial<MappingDraft> = {}): MappingDraft {
  return createMappingDraft({
    mangaTitle: overrides.mangaTitle ?? trustedDraft.mangaTitle,
    chapters: overrides.chapters ?? trustedDraft.chapters,
    source: overrides.source,
    volumes: overrides.volumes ?? [
      { id: 'v1', number: '1', chapterIds: ['c1'] },
      { id: 'v2', number: '2', chapterIds: ['c2'] },
    ],
  });
}

function dependencies({ volumePaths = ['/work/volume-1.cbz', '/work/volume-2.cbz'] } = {}) {
  const bind = vi.fn<BindingPort['bind']>(() => Promise.resolve({ volumePaths, issues: [] }));
  const inspect = vi.fn<BindingPort['inspect']>(() =>
    Promise.resolve({ workspaceId: 'workspace-1', draft: trustedDraft, issues: [] }),
  );
  const release = vi.fn<BindingPort['release']>(() => Promise.resolve());
  const convert = vi.fn<ConversionPort['convert']>((request, options) => {
    options.onProgress({
      stage: 'processing',
      message: 'Processed a page.',
      page: 1,
      completed: 1,
      total: 1,
    });
    const artifact: ConversionArtifact = {
      id: `artifact-${request.inputPath}`,
      name: `${request.inputPath.split('/').at(-1) ?? 'book'}.${request.format}`,
      path: `${request.outputDirectory}/book.${request.format}`,
      bytes: 100,
      format: request.format,
    };
    return Promise.resolve(artifact);
  });
  return {
    binding: { bind, inspect, release } satisfies BindingPort,
    conversion: { convert } satisfies ConversionPort,
    bind,
    inspect,
    release,
    convert,
  };
}

const folder: InputSelection = {
  inputPath: '/input/Trusted Manga',
  displayName: 'Trusted Manga',
  kind: 'folder',
};
const cbz: InputSelection = {
  inputPath: '/input/Standalone.cbz',
  displayName: 'Standalone.cbz',
  kind: 'cbz',
};

describe('single-input workflow', () => {
  it('inspects folders for an offline mapping and keeps CBZ files direct', async () => {
    const ports = dependencies();
    let nextId = 0;
    const workflow = new SingleInputWorkflow(ports.binding, ports.conversion, () =>
      String(++nextId),
    );

    await expect(workflow.inspect(folder)).resolves.toMatchObject({
      sessionId: '1',
      kind: 'folder',
      mapping: trustedDraft,
    });
    await expect(workflow.inspect(cbz)).resolves.toEqual({
      sessionId: '2',
      displayName: 'Standalone.cbz',
      kind: 'cbz',
      issues: [],
    });
    expect(ports.inspect).toHaveBeenCalledOnce();
  });

  it('binds a trusted folder mapping and converts volumes strictly sequentially', async () => {
    const ports = dependencies();
    const order: string[] = [];
    ports.bind.mockImplementation(() => {
      order.push('bind');
      return Promise.resolve({
        volumePaths: ['/work/volume-1.cbz', '/work/volume-2.cbz'],
        issues: [],
      });
    });
    ports.convert.mockImplementation(async (request) => {
      order.push(`start:${request.inputPath}`);
      await Promise.resolve();
      order.push(`finish:${request.inputPath}`);
      return {
        id: request.inputPath,
        name: 'book.epub',
        path: `/library/${request.inputPath.split('/').at(-1)}.epub`,
        bytes: 100,
        format: 'epub',
      };
    });
    const workflow = new SingleInputWorkflow(ports.binding, ports.conversion, () => 'session');
    const inspected = await workflow.inspect(folder);
    const onProgress = vi.fn();
    const submitted = mappedDraft({
      chapters: trustedDraft.chapters.map((chapter) => ({
        ...chapter,
        path: '/renderer/cannot-replace-trusted-path',
      })),
      source: { provider: 'mangadex', id: 'suggestion-id' },
    });
    const artifacts = await workflow.convert(
      {
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: { ...defaultMangapressSettings, deviceProfile: 'KPW5' },
        format: 'epub',
        mapping: submitted,
      },
      { onProgress },
    );

    expect(order).toEqual([
      'bind',
      'start:/work/volume-1.cbz',
      'finish:/work/volume-1.cbz',
      'start:/work/volume-2.cbz',
      'finish:/work/volume-2.cbz',
    ]);
    expect(ports.bind.mock.calls[0]?.[1].chapters[0]?.path).toBe('/trusted/c1');
    expect(ports.bind.mock.calls[0]?.[1].source).toEqual({
      provider: 'mangadex',
      id: 'suggestion-id',
    });
    expect(artifacts).toHaveLength(2);
    expect(onProgress).toHaveBeenLastCalledWith({
      stage: 'saving',
      message: '2 books saved.',
    });
  });

  it('bypasses binding for a direct CBZ and propagates cancellation to conversion', async () => {
    const ports = dependencies();
    const workflow = new SingleInputWorkflow(ports.binding, ports.conversion, () => 'direct');
    const inspected = await workflow.inspect(cbz);
    const controller = new AbortController();
    await workflow.convert(
      {
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'cbz',
      },
      { signal: controller.signal, onProgress: vi.fn() },
    );

    expect(ports.bind).not.toHaveBeenCalled();
    expect(ports.convert).toHaveBeenCalledWith(
      expect.objectContaining({ inputPath: '/input/Standalone.cbz', format: 'cbz' }),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('rejects stale sessions, absent or invalid mappings, and empty binding output', async () => {
    const ports = dependencies({ volumePaths: [] });
    const workflow = new SingleInputWorkflow(ports.binding, ports.conversion, () => 'folder');
    await expect(
      workflow.convert(
        {
          sessionId: 'missing',
          libraryPath: '/library',
          settings: defaultMangapressSettings,
          format: 'epub',
        },
        { onProgress: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'session_not_found' });

    await workflow.inspect(folder);
    await expect(
      workflow.convert(
        {
          sessionId: 'folder',
          libraryPath: '/library',
          settings: defaultMangapressSettings,
          format: 'epub',
        },
        { onProgress: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'mapping_required' });
    await expect(
      workflow.convert(
        {
          sessionId: 'folder',
          libraryPath: '/library',
          settings: defaultMangapressSettings,
          format: 'epub',
          mapping: {
            ...trustedDraft,
            volumes: [{ id: 'v1', number: '1', chapterIds: ['unknown'] }],
          },
        },
        { onProgress: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'invalid_mapping' });
    await expect(
      workflow.convert(
        {
          sessionId: 'folder',
          libraryPath: '/library',
          settings: defaultMangapressSettings,
          format: 'epub',
          mapping: {
            ...trustedDraft,
            volumes: [{ id: 'v1', number: '1', chapterIds: [] }],
          },
        },
        { onProgress: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'invalid_mapping' });
    await expect(
      workflow.convert(
        {
          sessionId: 'folder',
          libraryPath: '/library',
          settings: defaultMangapressSettings,
          format: 'epub',
          mapping: createMappingDraft({
            mangaTitle: 'Conflict',
            chapters: [
              { ...trustedDraft.chapters[0]!, parsedVolume: 9 },
              trustedDraft.chapters[1]!,
            ],
            volumes: [{ id: 'v1', number: '1', chapterIds: ['c1', 'c2'] }],
          }),
        },
        { onProgress: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'no_volumes' });
  });

  it('releases folder workspaces and treats direct and unknown sessions as no-op cleanup', async () => {
    const ports = dependencies();
    let id = 0;
    const workflow = new SingleInputWorkflow(ports.binding, ports.conversion, () => String(++id));
    const inspectedFolder = await workflow.inspect(folder);
    const inspectedCbz = await workflow.inspect(cbz);

    await workflow.release(inspectedFolder.sessionId);
    await workflow.release(inspectedCbz.sessionId);
    await workflow.release('missing');

    expect(ports.release).toHaveBeenCalledExactlyOnceWith('workspace-1');
  });

  it('releases every remaining workspace during application shutdown', async () => {
    const ports = dependencies();
    let id = 0;
    const workflow = new SingleInputWorkflow(ports.binding, ports.conversion, () => String(++id));
    await workflow.inspect(folder);
    await workflow.inspect(cbz);

    await workflow.releaseAll();
    await workflow.releaseAll();

    expect(ports.release).toHaveBeenCalledExactlyOnceWith('workspace-1');
  });
});
