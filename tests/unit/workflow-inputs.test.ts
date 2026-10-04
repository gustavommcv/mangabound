import { describe, expect, it, vi } from 'vitest';
import { ConversionWorkflow } from '@/application/workflows/conversion-workflow';
import type { ConversionArtifact, ConversionProgress } from '@/domain/conversion';
import { createMappingDraft } from '@/domain/mapping';
import { defaultMangapressSettings } from '@/domain/output-profile';

import {
  trustedDraft,
  mappedDraft,
  numbered,
  dependencies,
  folder,
  cbz,
} from './support/conversion-workflow';

describe('conversion workflow', () => {
  it('inspects folders for an offline mapping and keeps CBZ files direct', async () => {
    const ports = dependencies();
    let nextId = 0;
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => String(++nextId),
      ports.bookFiles,
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
    // Chapters with pages in them: this is one manga, so it is never read as a library too.
    expect(ports.planBatch).not.toHaveBeenCalled();
  });

  it('binds a trusted folder mapping and converts volumes strictly sequentially', async () => {
    const ports = dependencies();
    const order: string[] = [];
    ports.bind.mockImplementation((_workspace, _mapping, _signal, _combine, onBindingProgress) => {
      order.push('bind');
      onBindingProgress?.({
        stage: 'write',
        state: 'advanced',
        manga: 'Trusted Manga',
        volumeIndex: 1,
        volumeCount: 2,
        completedPages: 2,
        totalPages: 5,
      });
      return Promise.resolve({
        volumes: numbered(['/work/volume-1.cbz', '/work/volume-2.cbz']),
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
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => 'session',
      ports.bookFiles,
    );
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
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'binding',
        bindingState: 'advanced',
        message: 'Building volume 1 of 2…',
        completed: 2,
        total: 5,
      }),
    );
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ completed: 2, total: 2 }));
    expect(onProgress).toHaveBeenLastCalledWith({
      stage: 'saving',
      message: '2 books saved.',
      completed: 2,
      total: 2,
      volumes: [
        { number: 1, status: 'done' },
        { number: 2, status: 'done' },
      ],
    });
  });

  it('converts at most the configured number of volumes while preserving result and catalog order', async () => {
    const paths = [1, 2, 3, 4].map((number) => `/work/volume-${String(number)}.cbz`);
    const ports = dependencies({ volumePaths: paths });
    const pending = new Map<string, (artifact: ConversionArtifact) => void>();
    const active = new Set<string>();
    let peak = 0;
    ports.convert.mockImplementation(
      (request, options) =>
        new Promise((resolve) => {
          active.add(request.inputPath);
          peak = Math.max(peak, active.size);
          options.onProgress({
            stage: 'processing',
            message: 'Processed page 1 of 2.',
            completed: 1,
            total: 2,
          });
          if (request.inputPath === paths[1]) {
            options.onProgress({ stage: 'saving', message: 'Saving the finished book…' });
          }
          pending.set(request.inputPath, (artifact) => {
            active.delete(request.inputPath);
            resolve(artifact);
          });
        }),
    );
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => 'session',
      ports.bookFiles,
      2,
    );
    const inspected = await workflow.inspect(folder);
    const progress: ConversionProgress[] = [];
    const published: string[] = [];
    const run = workflow.convert(
      {
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'epub',
        mapping: mappedDraft(),
      },
      {
        onProgress: (update) => progress.push(update),
        onArtifact: (artifact) => published.push(artifact.id),
      },
    );
    const finish = (number: number): void => {
      const inputPath = paths[number - 1]!;
      pending.get(inputPath)?.({
        id: `artifact-${String(number)}`,
        name: `volume-${String(number)}.epub`,
        path: `/library/volume-${String(number)}.epub`,
        bytes: 100,
        format: 'epub',
        title: 'Trusted Manga',
        author: 'Unknown',
      });
    };

    await vi.waitFor(() => {
      expect(ports.convert).toHaveBeenCalledTimes(2);
    });
    expect(active.size).toBe(2);
    finish(2);
    await vi.waitFor(() => {
      expect(ports.convert).toHaveBeenCalledTimes(3);
    });
    finish(3);
    await vi.waitFor(() => {
      expect(ports.convert).toHaveBeenCalledTimes(4);
    });
    finish(4);
    finish(1);
    const artifacts = await run;

    expect(peak).toBe(2);
    expect(artifacts.map((artifact) => artifact.id)).toEqual([
      'artifact-1',
      'artifact-2',
      'artifact-3',
      'artifact-4',
    ]);
    expect(published).toEqual(artifacts.map((artifact) => artifact.id));
    const aggregate = progress.filter(
      (update) => update.stage === 'processing' && update.total === 4,
    );
    expect(aggregate.length).toBeGreaterThan(0);
    expect(aggregate[0]?.volumes?.map((volume) => volume.status)).toEqual([
      'waiting',
      'waiting',
      'waiting',
      'waiting',
    ]);
    expect(aggregate.map((update) => update.completed)).toEqual(
      [...aggregate.map((update) => update.completed)].sort((a, b) => (a ?? 0) - (b ?? 0)),
    );
    expect(aggregate.at(-1)).toMatchObject({ completed: 4, total: 4 });
    expect(aggregate.every((update) => /^\d of 4 volumes converted\.$/u.test(update.message))).toBe(
      true,
    );
    expect(
      aggregate.some(
        (update) => update.volumes?.[1]?.status === 'saving' && update.volumes[1].completed === 1,
      ),
    ).toBe(true);
    expect(aggregate.at(-1)?.volumes?.map((volume) => volume.status)).toEqual([
      'done',
      'done',
      'done',
      'done',
    ]);
  });

  it('stops scheduling after a failure, lets active work finish and retains completed books', async () => {
    const paths = [1, 2, 3].map((number) => `/work/volume-${String(number)}.cbz`);
    const ports = dependencies({ volumePaths: paths });
    let failFirst: ((error: Error) => void) | undefined;
    let finishSecond: ((artifact: ConversionArtifact) => void) | undefined;
    let secondSignal: AbortSignal | undefined;
    ports.convert.mockImplementation((request, options) => {
      if (request.inputPath === paths[0]) {
        return new Promise((_resolve, reject) => {
          failFirst = reject;
        });
      }
      secondSignal = options.signal;
      return new Promise((resolve) => {
        finishSecond = resolve;
      });
    });
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => 'session',
      ports.bookFiles,
      2,
    );
    const inspected = await workflow.inspect(folder);
    const published: string[] = [];
    const run = workflow.convert(
      {
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'epub',
        mapping: mappedDraft(),
      },
      {
        onProgress: vi.fn(),
        onArtifact: (artifact) => published.push(artifact.id),
      },
    );
    await vi.waitFor(() => {
      expect(ports.convert).toHaveBeenCalledTimes(2);
    });
    failFirst?.(new Error('volume 1 failed'));
    expect(secondSignal?.aborted).toBe(false);
    finishSecond?.({
      id: 'artifact-2',
      name: 'volume-2.epub',
      path: '/library/volume-2.epub',
      bytes: 100,
      format: 'epub',
      title: 'Trusted Manga',
      author: 'Unknown',
    });
    await expect(run).rejects.toThrow('volume 1 failed');
    expect(ports.convert).toHaveBeenCalledTimes(2);
    expect(published).toEqual(['artifact-2']);
    expect(ports.release).not.toHaveBeenCalled();
  });

  it('fans user cancellation out to every active conversion without starting later volumes', async () => {
    const ports = dependencies({
      volumePaths: ['/work/volume-1.cbz', '/work/volume-2.cbz', '/work/volume-3.cbz'],
    });
    const controller = new AbortController();
    const stopped: string[] = [];
    ports.convert.mockImplementation(
      (request, options) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            stopped.push(request.inputPath);
            reject(options.signal?.reason as Error);
          });
        }),
    );
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => 'session',
      ports.bookFiles,
      2,
    );
    const inspected = await workflow.inspect(folder);
    const run = workflow.convert(
      {
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'epub',
        mapping: mappedDraft(),
      },
      { onProgress: vi.fn(), signal: controller.signal },
    );
    await vi.waitFor(() => {
      expect(ports.convert).toHaveBeenCalledTimes(2);
    });
    controller.abort(new DOMException('Cancelled by user', 'AbortError'));
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(stopped).toEqual(['/work/volume-1.cbz', '/work/volume-2.cbz']);
    expect(ports.convert).toHaveBeenCalledTimes(2);
  });

  it('binds combined and converts the one combined file, not per volume, when the setting is on', async () => {
    const ports = dependencies();
    ports.bind.mockResolvedValue({
      volumes: [],
      combinedOutputPath: '/work/Trusted Manga.cbz',
      issues: [],
    });
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => 'session',
      ports.bookFiles,
    );
    const inspected = await workflow.inspect(folder);

    const artifacts = await workflow.convert(
      {
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        singleBook: true,
        format: 'epub',
        mapping: mappedDraft(),
      },
      { onProgress: vi.fn() },
    );

    expect(ports.bind).toHaveBeenCalledWith(
      'workspace-1',
      expect.anything(),
      undefined,
      true,
      expect.any(Function),
    );
    expect(ports.convert).toHaveBeenCalledTimes(1);
    expect(ports.convert.mock.calls[0]?.[0].inputPath).toBe('/work/Trusted Manga.cbz');
    expect(artifacts).toHaveLength(1);
  });

  it('reports no volumes when a combined bind produces no combined file', async () => {
    const ports = dependencies();
    ports.bind.mockResolvedValue({ volumes: [], issues: [] });
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => 'session',
      ports.bookFiles,
    );
    const inspected = await workflow.inspect(folder);

    await expect(
      workflow.convert(
        {
          sessionId: inspected.sessionId,
          libraryPath: '/library',
          settings: defaultMangapressSettings,
          singleBook: true,
          format: 'epub',
          mapping: mappedDraft(),
        },
        { onProgress: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'no_volumes' });
    expect(ports.convert).not.toHaveBeenCalled();
  });

  it('enforces bind-and-convert and EPUB format for single-book mode in convert and plan', async () => {
    const ports = dependencies();
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => 'session',
      ports.bookFiles,
    );
    const inspected = await workflow.inspect(folder);

    // mode != bind-and-convert
    await expect(
      workflow.convert(
        {
          sessionId: inspected.sessionId,
          libraryPath: '/library',
          settings: defaultMangapressSettings,
          format: 'epub',
          mode: 'bind-only',
          singleBook: true,
          mapping: mappedDraft(),
        },
        { onProgress: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'invalid_settings' });

    await expect(
      workflow.plan({
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'epub',
        mode: 'bind-only',
        singleBook: true,
        mapping: mappedDraft(),
      }),
    ).rejects.toMatchObject({ code: 'invalid_settings' });

    // format != epub
    await expect(
      workflow.convert(
        {
          sessionId: inspected.sessionId,
          libraryPath: '/library',
          settings: defaultMangapressSettings,
          format: 'cbz',
          singleBook: true,
          mapping: mappedDraft(),
        },
        { onProgress: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'invalid_settings' });

    await expect(
      workflow.plan({
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'pdf',
        singleBook: true,
        mapping: mappedDraft(),
      }),
    ).rejects.toMatchObject({ code: 'invalid_settings' });
  });

  it('bypasses single-book mode for single .cbz input without error or nested TOC', async () => {
    const ports = dependencies();
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => 'direct',
      ports.bookFiles,
    );
    const inspected = await workflow.inspect(cbz);

    const artifacts = await workflow.convert(
      {
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'epub',
        singleBook: true,
      },
      { onProgress: vi.fn() },
    );

    expect(ports.bind).not.toHaveBeenCalled();
    expect(ports.convert).toHaveBeenCalledWith(
      expect.objectContaining({ nestedToc: false }),
      expect.anything(),
    );
    expect(artifacts).toHaveLength(1);

    const inspectedForPlan = await workflow.inspect(cbz);
    const plan = await workflow.plan({
      sessionId: inspectedForPlan.sessionId,
      libraryPath: '/library',
      settings: defaultMangapressSettings,
      format: 'epub',
      singleBook: true,
    });
    expect(plan.books).toHaveLength(1);
  });

  it('reports single book for the series in plan when singleBook is true', async () => {
    const ports = dependencies();
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => 'session',
      ports.bookFiles,
    );
    const inspected = await workflow.inspect(folder);

    const plan = await workflow.plan({
      sessionId: inspected.sessionId,
      libraryPath: '/library',
      settings: defaultMangapressSettings,
      format: 'epub',
      singleBook: true,
      mapping: mappedDraft(),
    });

    expect(plan.message).toContain('single book for the series');
    expect(plan.books).toEqual([{ name: 'One EPUB for Trusted Manga', pageCount: 5 }]);
  });

  it('bypasses binding for a direct CBZ and propagates cancellation to conversion', async () => {
    const ports = dependencies();
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => 'direct',
      ports.bookFiles,
    );
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
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => String(++id),
      ports.bookFiles,
    );
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
      // Named as the books the run makes, in the format chosen, not as the CBZ files mangabind joins.
      books: [
        { name: 'Trusted Manga - Vol.01.epub', pageCount: 2 },
        { name: 'Trusted Manga - Vol.02.epub', pageCount: 3 },
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
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => 'folder',
      ports.bookFiles,
    );
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
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => 'direct',
      ports.bookFiles,
    );
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
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => 'folder-plan',
      ports.bookFiles,
    );

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
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => String(++id),
      ports.bookFiles,
    );
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
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => String(++id),
      ports.bookFiles,
    );
    await workflow.inspect(folder);
    await workflow.inspect(cbz);

    await workflow.releaseAll();
    await workflow.releaseAll();

    expect(ports.release).toHaveBeenCalledExactlyOnceWith('workspace-1');
  });
});

describe('the books a validated plan says it will make', () => {
  const settings = defaultMangapressSettings;

  async function plannedBooks(
    overrides: Partial<Parameters<ConversionWorkflow['plan']>[0]> & {
      details?: { title?: string };
    },
    volumes: readonly { name: string; pageCount: number; number?: number }[] = [
      { name: 'Trusted Manga - Vol.01.cbz', pageCount: 2, number: 1 },
      { name: 'Trusted Manga - Vol.02.cbz', pageCount: 3, number: 2 },
    ],
  ) {
    const ports = dependencies();
    ports.bindingPlan.mockResolvedValue({ title: 'Trusted Manga', volumes, issues: [] });
    let id = 0;
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => String(++id),
      ports.bookFiles,
    );
    const { sessionId } = await workflow.inspect(folder);
    const plan = await workflow.plan({
      sessionId,
      libraryPath: '/library',
      settings,
      format: 'epub',
      mapping: mappedDraft(),
      ...overrides,
    });
    return plan.books.map((book) => book.name);
  }

  it('names the title that was typed, the number of the volume and the format chosen', async () => {
    expect(await plannedBooks({ details: { title: 'My Title' } })).toEqual([
      'My Title - Vol.01.epub',
      'My Title - Vol.02.epub',
    ]);
  });

  it('keeps the name the tool gave a volume when no title was typed, in the format chosen', async () => {
    expect(await plannedBooks({ format: 'cbz' })).toEqual([
      'Trusted Manga - Vol.01.cbz',
      'Trusted Manga - Vol.02.cbz',
    ]);
    expect(await plannedBooks({ format: 'pdf' })).toEqual([
      'Trusted Manga - Vol.01.pdf',
      'Trusted Manga - Vol.02.pdf',
    ]);
  });

  it('counts a title of blanks as none', async () => {
    expect(await plannedBooks({ details: { title: '   ' } })).toEqual([
      'Trusted Manga - Vol.01.epub',
      'Trusted Manga - Vol.02.epub',
    ]);
  });

  it('numbers a volume that is not a whole number the way the files are named', async () => {
    expect(
      await plannedBooks({ details: { title: 'Series' } }, [
        { name: 'x.cbz', pageCount: 1, number: 1.5 },
      ]),
    ).toEqual(['Series - Vol.1.5.epub']);
  });

  it('uses the name of the file when the tool did not say the number of a volume', async () => {
    expect(
      await plannedBooks({ details: { title: 'Series' } }, [
        { name: 'Odd name.CBZ', pageCount: 1 },
      ]),
    ).toEqual(['Odd name.epub']);
  });

  it('says the CBZ files that will be saved when the run stops after joining, whatever the format', async () => {
    expect(await plannedBooks({ mode: 'bind-only', details: { title: 'My Title' } })).toEqual([
      'Trusted Manga - Vol.01.cbz',
      'Trusted Manga - Vol.02.cbz',
    ]);
  });
});

describe('the folders of a manga that mangabind could not read as chapters', () => {
  const unparsed = (folderName: string) => ({
    tool: 'mangabind' as const,
    severity: 'warning' as const,
    code: 'unparsed_chapter',
    stage: 'parse',
    recoverable: true,
    message: `Couldn't parse chapter name "${folderName}"; it was skipped.`,
    path: `/input/Trusted Manga/${folderName}`,
  });

  async function inspected(issues: readonly ReturnType<typeof unparsed>[]) {
    const ports = dependencies();
    ports.inspect.mockResolvedValue({ workspaceId: 'workspace-1', draft: trustedDraft, issues });
    let id = 0;
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => String(++id),
      ports.bookFiles,
    );
    return workflow.inspect(folder);
  }

  it('are told by name with what was read, so that nothing hides them', async () => {
    const result = await inspected([unparsed('Omake'), unparsed('Ch.004 [GroupA]')]);

    expect(result.unrecognized).toEqual(['Omake', 'Ch.004 [GroupA]']);
    expect(result.issues).toHaveLength(2);
  });

  it('are not mentioned when there are none', async () => {
    expect(await inspected([])).not.toHaveProperty('unrecognized');
  });
});
