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
  const bindingPlan = vi.fn<BindingPort['plan']>(() =>
    Promise.resolve({
      title: 'Trusted Manga',
      volumes: [
        { name: 'Trusted Manga - Vol.01.cbz', pageCount: 2 },
        { name: 'Trusted Manga - Vol.02.cbz', pageCount: 3 },
      ],
      issues: [],
    }),
  );
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
      title: 'Standalone',
      author: 'Unknown',
    };
    return Promise.resolve(artifact);
  });
  const conversionPlan = vi.fn<ConversionPort['plan']>(() =>
    Promise.resolve({
      title: 'Standalone',
      name: 'Standalone.epub',
      pageCount: 3,
      profile: 'KV',
      width: 1072,
      height: 1448,
    }),
  );
  const planBatch = vi.fn<NonNullable<BindingPort['planBatch']>>(() =>
    Promise.resolve({
      titles: [
        {
          title: 'Good Manga',
          inputPath: '/library/Good Manga',
          status: 'completed',
          draft: trustedDraft,
          volumes: [{ name: 'Good Manga - Vol.01.cbz', pageCount: 2 }],
          issues: [],
        },
      ],
      issues: [],
    }),
  );
  const bindBatch = vi.fn<NonNullable<BindingPort['bindBatch']>>(() =>
    Promise.resolve({
      workspaceId: 'batch-workspace',
      titles: [
        {
          title: 'Good Manga',
          status: 'completed',
          volumePaths: ['/work/batch/good-vol-1.cbz', '/work/batch/good-vol-2.cbz'],
          issues: [],
        },
        {
          title: 'Broken Manga',
          status: 'failed',
          volumePaths: [],
          issues: [],
        },
      ],
      issues: [],
    }),
  );
  const writeTitleMapping = vi.fn<NonNullable<BindingPort['writeTitleMapping']>>(() =>
    Promise.resolve(),
  );
  return {
    binding: {
      bind,
      inspect,
      plan: bindingPlan,
      release,
      planBatch,
      bindBatch,
      writeTitleMapping,
    } satisfies BindingPort,
    conversion: { convert, plan: conversionPlan } satisfies ConversionPort,
    bind,
    bindingPlan,
    inspect,
    release,
    convert,
    conversionPlan,
    planBatch,
    bindBatch,
    writeTitleMapping,
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
        title: 'Standalone',
        author: 'Unknown',
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
      source: { provider: 'external', id: 'suggestion-id' },
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
      provider: 'external',
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

  it('validates folder plans with mangabind and direct CBZ plans with mangapress', async () => {
    const ports = dependencies();
    let id = 0;
    const workflow = new SingleInputWorkflow(ports.binding, ports.conversion, () => String(++id));
    const inspectedFolder = await workflow.inspect(folder);
    const inspectedCbz = await workflow.inspect(cbz);
    const controller = new AbortController();

    await expect(
      workflow.plan(
        {
          sessionId: inspectedFolder.sessionId,
          libraryPath: '/library',
          settings: defaultMangapressSettings,
          format: 'epub',
          mapping: mappedDraft(),
        },
        { signal: controller.signal },
      ),
    ).resolves.toEqual({
      tool: 'mangabind',
      title: 'Trusted Manga',
      message: 'mangabind validated 2 volumes · no library files written',
      books: [
        { name: 'Trusted Manga - Vol.01.cbz', pageCount: 2 },
        { name: 'Trusted Manga - Vol.02.cbz', pageCount: 3 },
      ],
      issues: [],
    });
    expect(ports.bindingPlan).toHaveBeenCalledWith(
      'workspace-1',
      expect.objectContaining({ mangaTitle: 'Trusted Manga' }),
      controller.signal,
    );

    await expect(
      workflow.plan(
        {
          sessionId: inspectedCbz.sessionId,
          libraryPath: '/library',
          settings: defaultMangapressSettings,
          format: 'epub',
        },
        { signal: controller.signal },
      ),
    ).resolves.toEqual({
      tool: 'mangapress',
      title: 'Standalone',
      message: 'mangapress validated KV · 1072 × 1448 · no library files written',
      books: [{ name: 'Standalone.epub', pageCount: 3 }],
      issues: [],
    });
    expect(ports.conversionPlan).toHaveBeenCalledWith(
      expect.objectContaining({ inputPath: '/input/Standalone.cbz' }),
      { signal: controller.signal },
    );
    await workflow.plan({
      sessionId: inspectedCbz.sessionId,
      libraryPath: '/library',
      settings: defaultMangapressSettings,
      format: 'epub',
    });
    expect(ports.conversionPlan).toHaveBeenLastCalledWith(
      expect.objectContaining({ inputPath: '/input/Standalone.cbz' }),
      {},
    );

    ports.bindingPlan.mockResolvedValueOnce({
      title: 'Trusted Manga',
      volumes: [{ name: 'Trusted Manga - Vol.01.cbz', pageCount: 5 }],
      issues: [],
    });
    await expect(
      workflow.plan({
        sessionId: inspectedFolder.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'epub',
        mapping: mappedDraft(),
      }),
    ).resolves.toMatchObject({
      message: 'mangabind validated 1 volume · no library files written',
    });
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

  it('rejects invalid output settings before invoking either tool', async () => {
    const ports = dependencies();
    const workflow = new SingleInputWorkflow(ports.binding, ports.conversion, () => 'direct');
    const inspected = await workflow.inspect(cbz);

    await expect(
      workflow.convert(
        {
          sessionId: inspected.sessionId,
          libraryPath: '/library',
          settings: { ...defaultMangapressSettings, jpegQuality: 101 },
          format: 'epub',
        },
        { onProgress: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'invalid_settings' });
    expect(ports.bind).not.toHaveBeenCalled();
    expect(ports.convert).not.toHaveBeenCalled();

    await expect(
      workflow.plan({
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: { ...defaultMangapressSettings, customWidth: 0 },
        format: 'epub',
      }),
    ).rejects.toMatchObject({ code: 'invalid_settings' });
  });

  it('rejects stale and unconfirmed folder plan requests', async () => {
    const ports = dependencies();
    const workflow = new SingleInputWorkflow(ports.binding, ports.conversion, () => 'folder-plan');

    await expect(
      workflow.plan({
        sessionId: 'missing',
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'epub',
      }),
    ).rejects.toMatchObject({ code: 'session_not_found' });
    const inspected = await workflow.inspect(folder);
    await expect(
      workflow.plan({
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'epub',
      }),
    ).rejects.toMatchObject({ code: 'mapping_required' });
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

  it('delegates batch planning and title-mapping writes to the binding port', async () => {
    const ports = dependencies();
    const workflow = new SingleInputWorkflow(ports.binding, ports.conversion, () => 'id');
    const controller = new AbortController();

    await expect(workflow.planBatch('/library', controller.signal)).resolves.toMatchObject({
      titles: [{ title: 'Good Manga' }],
    });
    expect(ports.planBatch).toHaveBeenCalledWith('/library', controller.signal);

    await workflow.writeTitleMapping('/library/Good Manga', mappedDraft());
    expect(ports.writeTitleMapping).toHaveBeenCalledWith('/library/Good Manga', mappedDraft());
  });

  it('rejects batch operations when the binding port does not support them', async () => {
    const ports = dependencies();
    const bindingWithoutBatch: BindingPort = {
      bind: ports.bind,
      inspect: ports.inspect,
      plan: ports.bindingPlan,
      release: ports.release,
    };
    const workflow = new SingleInputWorkflow(bindingWithoutBatch, ports.conversion, () => 'id');

    await expect(workflow.planBatch('/library')).rejects.toThrow(/does not support/u);
    await expect(workflow.writeTitleMapping('/library/Manga', mappedDraft())).rejects.toThrow(
      /does not support/u,
    );
    await expect(
      workflow.convertBatch(
        {
          parentPath: '/library',
          libraryPath: '/output',
          settings: defaultMangapressSettings,
          format: 'epub',
        },
        { onProgress: vi.fn() },
      ),
    ).rejects.toThrow(/does not support/u);
  });

  it('rejects invalid output settings before invoking batch binding', async () => {
    const ports = dependencies();
    const workflow = new SingleInputWorkflow(ports.binding, ports.conversion, () => 'id');

    await expect(
      workflow.convertBatch(
        {
          parentPath: '/library',
          libraryPath: '/output',
          settings: { ...defaultMangapressSettings, jpegQuality: 101 },
          format: 'epub',
        },
        { onProgress: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'invalid_settings' });
    expect(ports.bindBatch).not.toHaveBeenCalled();
  });

  it('converts every volume of a successful batch title and isolates a bind-phase failure', async () => {
    const ports = dependencies();
    const onProgress = vi.fn();
    const workflow = new SingleInputWorkflow(ports.binding, ports.conversion, () => 'id');

    const outcomes = await workflow.convertBatch(
      {
        parentPath: '/library',
        libraryPath: '/output',
        settings: defaultMangapressSettings,
        format: 'epub',
      },
      { onProgress },
    );

    expect(ports.convert).toHaveBeenCalledTimes(2);
    expect(outcomes).toMatchObject([
      {
        title: 'Good Manga',
        status: 'done',
        artifacts: [
          { id: 'artifact-/work/batch/good-vol-1.cbz' },
          { id: 'artifact-/work/batch/good-vol-2.cbz' },
        ],
      },
      { title: 'Broken Manga', status: 'failed', artifacts: [] },
    ]);
    expect(outcomes[1]!.error).toMatchObject({ code: 'binding_failed' });
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Good Manga', stage: 'processing' }),
    );
    expect(ports.release).toHaveBeenCalledExactlyOnceWith('batch-workspace');
  });

  it('isolates a mangapress-phase failure to its own title and keeps converting the rest', async () => {
    const ports = dependencies();
    ports.convert.mockImplementationOnce(() => Promise.reject(new Error('mangapress crashed')));
    const workflow = new SingleInputWorkflow(ports.binding, ports.conversion, () => 'id');

    const outcomes = await workflow.convertBatch(
      {
        parentPath: '/library',
        libraryPath: '/output',
        settings: defaultMangapressSettings,
        format: 'epub',
      },
      { onProgress: vi.fn() },
    );

    expect(outcomes[0]).toMatchObject({ title: 'Good Manga', status: 'failed', artifacts: [] });
    expect(outcomes[0]!.error).toMatchObject({ message: 'mangapress crashed' });
    // The bind-phase failure for the other title is still reported, not skipped.
    expect(outcomes[1]).toMatchObject({ title: 'Broken Manga', status: 'failed' });
    expect(ports.release).toHaveBeenCalledExactlyOnceWith('batch-workspace');
  });

  it('stops before starting the next title once cancelled, and still releases the workspace', async () => {
    const ports = dependencies();
    const controller = new AbortController();
    // Simulates the real subprocess adapter: an in-flight convert() rejects once its signal aborts.
    ports.convert.mockImplementationOnce(() => {
      controller.abort();
      return Promise.reject(new Error('aborted'));
    });
    const workflow = new SingleInputWorkflow(ports.binding, ports.conversion, () => 'id');

    const outcomes = await workflow.convertBatch(
      {
        parentPath: '/library',
        libraryPath: '/output',
        settings: defaultMangapressSettings,
        format: 'epub',
      },
      { onProgress: vi.fn(), signal: controller.signal },
    );

    // The interrupted title is reported as failed, and the loop stops before "Broken Manga".
    expect(ports.convert).toHaveBeenCalledTimes(1);
    expect(outcomes).toMatchObject([{ title: 'Good Manga', status: 'failed', artifacts: [] }]);
    expect(outcomes[0]!.error).toMatchObject({ message: 'aborted' });
    expect(ports.release).toHaveBeenCalledExactlyOnceWith('batch-workspace');
  });

  it('restricts conversion to the requested titles when retrying one after a partial run', async () => {
    const ports = dependencies();
    const workflow = new SingleInputWorkflow(ports.binding, ports.conversion, () => 'id');

    const outcomes = await workflow.convertBatch(
      {
        parentPath: '/library',
        libraryPath: '/output',
        settings: defaultMangapressSettings,
        format: 'epub',
        titles: ['Good Manga'],
      },
      { onProgress: vi.fn() },
    );

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ title: 'Good Manga', status: 'done' });
    expect(ports.convert).toHaveBeenCalledTimes(2);
  });
});
