import { describe, expect, it, vi } from 'vitest';

import type { BookFileStorePort } from '@/application/ports/book-file-store';
import type { BindingPort, ConversionPort } from '@/application/ports/conversion-tools';
import { SingleInputWorkflow } from '@/application/workflows/single-input';
import type { ConversionArtifact, ConversionProgress, InputSelection } from '@/domain/conversion';
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

/** Volume files numbered from 1, the way mangabind reports them. */
const numbered = (paths: readonly string[]) =>
  paths.map((path, index) => ({ number: index + 1, path }));

function dependencies({
  volumePaths = ['/work/volume-1.cbz', '/work/volume-2.cbz'],
  combinedOutputPath = '/work/combined.cbz',
} = {}) {
  const bind = vi.fn<BindingPort['bind']>((_workspaceId, _mapping, _signal, singleBook) =>
    Promise.resolve({
      volumes: singleBook ? [] : numbered(volumePaths),
      combinedOutputPath: singleBook ? combinedOutputPath : undefined,
      issues: [],
    }),
  );
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
  const planBatch = vi.fn<BindingPort['planBatch']>(() =>
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
  const bindBatch = vi.fn<BindingPort['bindBatch']>((_inputPath, _signal, combine) =>
    Promise.resolve({
      workspaceId: 'batch-workspace',
      titles: [
        {
          title: 'Good Manga',
          status: 'completed',
          volumes: combine
            ? []
            : numbered(['/work/batch/good-vol-1.cbz', '/work/batch/good-vol-2.cbz']),
          combinedOutputPath: combine ? '/work/batch/good-combined.cbz' : undefined,
          issues: [],
        },
        {
          title: 'Broken Manga',
          status: 'failed',
          volumes: [],
          issues: [],
        },
      ],
      issues: [],
    }),
  );
  const writeTitleMapping = vi.fn<BindingPort['writeTitleMapping']>(() => Promise.resolve());
  const readDetails = vi.fn<BindingPort['readDetails']>(() => Promise.resolve({}));
  const writeDetails = vi.fn<BindingPort['writeDetails']>(() => Promise.resolve());
  const saveBook = vi.fn<BookFileStorePort['saveBook']>(({ sourcePath, libraryPath }) => {
    const name = sourcePath.split('/').at(-1) ?? 'volume.cbz';
    return Promise.resolve({ path: `${libraryPath}/${name}`, name, bytes: 1234 });
  });
  // Publishes under the name the tool gave the file, the way a library with no clash would.
  const stageBook: BookFileStorePort['stageBook'] = async (request, produce) => {
    const produced = await produce(`${request.libraryPath}/.mangabound/incoming/staged`);
    const name = produced.path.split('/').at(-1) ?? 'book';
    return { produced, saved: { path: `${request.libraryPath}/${name}`, name, bytes: 100 } };
  };
  return {
    binding: {
      bind,
      inspect,
      plan: bindingPlan,
      release,
      planBatch,
      bindBatch,
      writeTitleMapping,
      readDetails,
      writeDetails,
    } satisfies BindingPort,
    conversion: { convert, plan: conversionPlan } satisfies ConversionPort,
    bookFiles: { saveBook, stageBook } satisfies BookFileStorePort,
    saveBook,
    bind,
    bindingPlan,
    inspect,
    release,
    convert,
    conversionPlan,
    planBatch,
    bindBatch,
    writeTitleMapping,
    readDetails,
    writeDetails,
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
const library: InputSelection = {
  inputPath: '/input/Library',
  displayName: 'Library',
  kind: 'folder',
};
// Read as one manga, a library's manga folders are chapters that have no pages of their own.
const libraryRead = createMappingDraft({
  mangaTitle: 'Library',
  chapters: [
    { id: 'l1', name: 'Good Manga', path: '/input/Library/Good Manga', pageCount: 0, chapter: 100 },
  ],
});

/** A workflow whose first input is a library, read the way mangabind reads one. */
async function openLibrary(ports: ReturnType<typeof dependencies>, maxParallelConversions = 1) {
  ports.inspect.mockResolvedValue({ workspaceId: 'workspace-1', draft: libraryRead, issues: [] });
  let id = 0;
  const workflow = new SingleInputWorkflow(
    ports.binding,
    ports.conversion,
    () => `id-${String(++id)}`,
    ports.bookFiles,
    maxParallelConversions,
  );
  const inspected = await workflow.inspect(library);
  return { workflow, sessionId: inspected.sessionId };
}

describe('single-input workflow', () => {
  it('inspects folders for an offline mapping and keeps CBZ files direct', async () => {
    const ports = dependencies();
    let nextId = 0;
    const workflow = new SingleInputWorkflow(
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
    const workflow = new SingleInputWorkflow(
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
    const workflow = new SingleInputWorkflow(
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
    const workflow = new SingleInputWorkflow(
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
    const workflow = new SingleInputWorkflow(
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
    const workflow = new SingleInputWorkflow(
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
    const workflow = new SingleInputWorkflow(
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
    const workflow = new SingleInputWorkflow(
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
    const workflow = new SingleInputWorkflow(
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
    const workflow = new SingleInputWorkflow(
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
    const workflow = new SingleInputWorkflow(
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
    const workflow = new SingleInputWorkflow(
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
    const workflow = new SingleInputWorkflow(
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
    const workflow = new SingleInputWorkflow(
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
    const workflow = new SingleInputWorkflow(
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
    const workflow = new SingleInputWorkflow(
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
    const workflow = new SingleInputWorkflow(
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

  describe('a library', () => {
    it('is what a folder is taken for when no chapter has pages and mangabind finds manga in it', async () => {
      const ports = dependencies();
      const { workflow } = await openLibrary(ports);

      await expect(workflow.inspect(library)).resolves.toEqual({
        sessionId: 'id-2',
        displayName: 'Library',
        kind: 'library',
        titles: [
          {
            title: 'Good Manga',
            draft: trustedDraft,
            volumes: [{ name: 'Good Manga - Vol.01.cbz', pageCount: 2 }],
            issues: [],
          },
        ],
        issues: [],
      });
      expect(ports.planBatch).toHaveBeenCalledWith('/input/Library', undefined);
      // Reading it as one manga left a scratch copy, which a library has no use for.
      expect(ports.release).toHaveBeenCalledWith('workspace-1');
    });

    it('keeps where each title lives to itself', async () => {
      const ports = dependencies();
      const { workflow } = await openLibrary(ports);

      const inspected = await workflow.inspect(library);

      expect(inspected.titles?.[0]).not.toHaveProperty('inputPath');
      expect(JSON.stringify(inspected)).not.toContain('/library/Good Manga');
    });

    it('is also what a folder with nothing readable in it is taken for, once manga turn up in it', async () => {
      const ports = dependencies();
      ports.inspect.mockResolvedValue({
        workspaceId: 'workspace-1',
        draft: createMappingDraft({ mangaTitle: 'Library', chapters: [] }),
        issues: [],
      });
      const workflow = new SingleInputWorkflow(
        ports.binding,
        ports.conversion,
        () => 'id',
        ports.bookFiles,
      );

      await expect(workflow.inspect(library)).resolves.toMatchObject({ kind: 'library' });
    });

    it('stays a folder when the batch read finds no manga with chapters in it', async () => {
      const ports = dependencies();
      ports.inspect.mockResolvedValue({
        workspaceId: 'workspace-1',
        draft: libraryRead,
        issues: [],
      });
      ports.planBatch.mockResolvedValue({
        titles: [
          {
            title: 'Empty',
            inputPath: '/input/Library/Empty',
            status: 'failed',
            draft: createMappingDraft({ mangaTitle: 'Empty', chapters: [] }),
            volumes: [],
            issues: [],
          },
        ],
        issues: [],
      });
      const workflow = new SingleInputWorkflow(
        ports.binding,
        ports.conversion,
        () => 'id',
        ports.bookFiles,
      );

      await expect(workflow.inspect(library)).resolves.toMatchObject({
        kind: 'folder',
        mapping: libraryRead,
      });
      // The single read is what the session keeps, so nothing is released.
      expect(ports.release).not.toHaveBeenCalled();
    });

    it('stays a folder when it cannot be read as a library at all', async () => {
      const ports = dependencies();
      ports.inspect.mockResolvedValue({
        workspaceId: 'workspace-1',
        draft: libraryRead,
        issues: [],
      });
      ports.planBatch.mockRejectedValue(new Error('mangabind failed'));
      const workflow = new SingleInputWorkflow(
        ports.binding,
        ports.conversion,
        () => 'id',
        ports.bookFiles,
      );

      await expect(workflow.inspect(library)).resolves.toMatchObject({ kind: 'folder' });
    });

    it('lets a cancellation through instead of taking it for "not a library"', async () => {
      const ports = dependencies();
      ports.inspect.mockResolvedValue({
        workspaceId: 'workspace-1',
        draft: libraryRead,
        issues: [],
      });
      const controller = new AbortController();
      ports.planBatch.mockImplementation(() => {
        controller.abort();
        return Promise.reject(new Error('aborted'));
      });
      const workflow = new SingleInputWorkflow(
        ports.binding,
        ports.conversion,
        () => 'id',
        ports.bookFiles,
      );

      await expect(workflow.inspect(library, controller.signal)).rejects.toThrow('aborted');
    });

    it('is read again on request, and what was read replaces what was known', async () => {
      const ports = dependencies();
      const { workflow, sessionId } = await openLibrary(ports);
      ports.planBatch.mockClear();
      ports.planBatch.mockResolvedValue({
        titles: [
          {
            title: 'Good Manga',
            inputPath: '/library/Good Manga',
            status: 'completed',
            draft: mappedDraft(),
            volumes: [
              { name: 'Good Manga - Vol.01.cbz', pageCount: 2 },
              { name: 'Good Manga - Vol.02.cbz', pageCount: 3 },
            ],
            issues: [],
          },
        ],
        issues: [],
      });
      const controller = new AbortController();

      const planned = await workflow.planLibrary(sessionId, controller.signal);

      expect(ports.planBatch).toHaveBeenCalledExactlyOnceWith('/input/Library', controller.signal);
      expect(planned.titles.map((title) => title.volumes.length)).toEqual([2]);
      // The next write goes by what was read last.
      await workflow.writeTitleMapping(sessionId, 'Good Manga', mappedDraft());
      expect(ports.writeTitleMapping).toHaveBeenCalledWith('/library/Good Manga', mappedDraft());
    });

    it('refuses to be read again, written to or converted once it is gone or was never one', async () => {
      const ports = dependencies();
      const workflow = new SingleInputWorkflow(
        ports.binding,
        ports.conversion,
        () => 'id',
        ports.bookFiles,
      );
      const { sessionId: folderSession } = await workflow.inspect(folder);
      const convertRequest = {
        libraryPath: '/output',
        settings: defaultMangapressSettings,
        format: 'epub',
      } as const;

      await expect(workflow.planLibrary('gone')).rejects.toMatchObject({
        code: 'session_not_found',
      });
      await expect(workflow.planLibrary(folderSession)).rejects.toMatchObject({
        code: 'not_a_library',
      });
      await expect(
        workflow.writeTitleMapping(folderSession, 'Trusted Manga', mappedDraft()),
      ).rejects.toMatchObject({ code: 'not_a_library' });
      await expect(
        workflow.convertLibrary(
          { ...convertRequest, sessionId: folderSession },
          { onProgress: vi.fn() },
        ),
      ).rejects.toMatchObject({ code: 'not_a_library' });
      await expect(
        workflow.convertLibrary({ ...convertRequest, sessionId: 'gone' }, { onProgress: vi.fn() }),
      ).rejects.toMatchObject({ code: 'session_not_found' });
      expect(ports.bindBatch).not.toHaveBeenCalled();
    });

    it('saves a title mapping in that title folder, from the chapters it was read with', async () => {
      const ports = dependencies();
      const { workflow, sessionId } = await openLibrary(ports);
      const forgedChapters = trustedDraft.chapters.map((chapter) => ({
        ...chapter,
        path: '/somewhere/else',
      }));

      await workflow.writeTitleMapping(sessionId, 'Good Manga', {
        ...mappedDraft(),
        chapters: forgedChapters,
      });

      expect(ports.writeTitleMapping).toHaveBeenCalledExactlyOnceWith(
        '/library/Good Manga',
        mappedDraft(),
      );
    });

    it('refuses a mapping for a title it does not know, and one that names unknown chapters', async () => {
      const ports = dependencies();
      const { workflow, sessionId } = await openLibrary(ports);

      await expect(
        workflow.writeTitleMapping(sessionId, 'Not There', mappedDraft()),
      ).rejects.toMatchObject({ code: 'title_not_found' });
      await expect(
        workflow.writeTitleMapping(sessionId, 'Good Manga', {
          ...mappedDraft(),
          volumes: [{ id: 'v1', number: '1', chapterIds: ['nope'] }],
        }),
      ).rejects.toMatchObject({ code: 'invalid_mapping' });
      expect(ports.writeTitleMapping).not.toHaveBeenCalled();
    });

    it('is not converted as if it were one input', async () => {
      const ports = dependencies();
      const { workflow, sessionId } = await openLibrary(ports);
      const request = {
        sessionId,
        libraryPath: '/output',
        settings: defaultMangapressSettings,
        format: 'epub',
      } as const;

      await expect(workflow.convert(request, { onProgress: vi.fn() })).rejects.toMatchObject({
        code: 'unsupported_mode',
      });
      await expect(workflow.plan(request)).rejects.toMatchObject({ code: 'unsupported_mode' });
    });

    it('holds no scratch copy of its own once read', async () => {
      const ports = dependencies();
      const { workflow } = await openLibrary(ports);
      ports.release.mockClear();

      await workflow.releaseAll();

      expect(ports.release).not.toHaveBeenCalled();
    });

    it('rejects invalid output settings before invoking batch binding', async () => {
      const ports = dependencies();
      const { workflow, sessionId } = await openLibrary(ports);

      await expect(
        workflow.convertLibrary(
          {
            sessionId,
            libraryPath: '/output',
            settings: { ...defaultMangapressSettings, jpegQuality: 101 },
            format: 'epub',
          },
          { onProgress: vi.fn() },
        ),
      ).rejects.toMatchObject({ code: 'invalid_settings' });
      expect(ports.bindBatch).not.toHaveBeenCalled();
    });

    it('converts every volume of a successful title and isolates a bind-phase failure', async () => {
      const ports = dependencies();
      const { workflow, sessionId } = await openLibrary(ports);
      const onProgress = vi.fn();

      const outcomes = await workflow.convertLibrary(
        {
          sessionId,
          libraryPath: '/output',
          settings: defaultMangapressSettings,
          format: 'epub',
        },
        { onProgress },
      );

      expect(ports.bindBatch).toHaveBeenCalledExactlyOnceWith(
        '/input/Library',
        undefined,
        false,
        expect.any(Function),
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
      expect(ports.release).toHaveBeenCalledWith('batch-workspace');
    });

    it('isolates a mangapress-phase failure to its own title and keeps converting the rest', async () => {
      const ports = dependencies();
      ports.convert.mockImplementationOnce(() => Promise.reject(new Error('mangapress crashed')));
      const { workflow, sessionId } = await openLibrary(ports);

      const outcomes = await workflow.convertLibrary(
        {
          sessionId,
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
      expect(ports.release).toHaveBeenCalledWith('batch-workspace');
    });

    it('converts library in single-book mode: one EPUB per title with nested TOC and failure isolation', async () => {
      const ports = dependencies();
      const { workflow, sessionId } = await openLibrary(ports);
      const onProgress = vi.fn();

      const outcomes = await workflow.convertLibrary(
        {
          sessionId,
          libraryPath: '/output',
          settings: defaultMangapressSettings,
          format: 'epub',
          singleBook: true,
        },
        { onProgress },
      );

      expect(ports.bindBatch).toHaveBeenCalledExactlyOnceWith(
        '/input/Library',
        undefined,
        true,
        expect.any(Function),
      );
      // Good Manga was converted as 1 book with nestedToc: true
      expect(ports.convert).toHaveBeenCalledTimes(1);
      expect(ports.convert).toHaveBeenCalledWith(
        expect.objectContaining({
          inputPath: '/work/batch/good-combined.cbz',
          nestedToc: true,
        }),
        expect.anything(),
      );
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Good Manga',
          volume: '1 of 1',
        }),
      );
      expect(outcomes).toMatchObject([
        {
          title: 'Good Manga',
          status: 'done',
          artifacts: [{ id: 'artifact-/work/batch/good-combined.cbz' }],
        },
        { title: 'Broken Manga', status: 'failed', artifacts: [] },
      ]);
      expect(outcomes[1]!.error).toMatchObject({ code: 'binding_failed' });
      expect(ports.release).toHaveBeenCalledWith('batch-workspace');
    });

    it('isolates mangapress failure per title in library single-book mode', async () => {
      const ports = dependencies();
      ports.convert.mockRejectedValueOnce(new Error('mangapress crash in single book'));
      const { workflow, sessionId } = await openLibrary(ports);

      const outcomes = await workflow.convertLibrary(
        {
          sessionId,
          libraryPath: '/output',
          settings: defaultMangapressSettings,
          format: 'epub',
          singleBook: true,
        },
        { onProgress: vi.fn() },
      );

      expect(outcomes[0]).toMatchObject({ title: 'Good Manga', status: 'failed' });
      expect(outcomes[0]!.error).toMatchObject({ message: 'mangapress crash in single book' });
      expect(outcomes[1]).toMatchObject({ title: 'Broken Manga', status: 'failed' });
      expect(ports.release).toHaveBeenCalledWith('batch-workspace');
    });

    it('rejects invalid single-book mode settings in convertLibrary', async () => {
      const ports = dependencies();
      const { workflow, sessionId } = await openLibrary(ports);

      await expect(
        workflow.convertLibrary(
          {
            sessionId,
            libraryPath: '/output',
            settings: defaultMangapressSettings,
            format: 'epub',
            mode: 'bind-only',
            singleBook: true,
          },
          { onProgress: vi.fn() },
        ),
      ).rejects.toMatchObject({ code: 'invalid_settings' });

      await expect(
        workflow.convertLibrary(
          {
            sessionId,
            libraryPath: '/output',
            settings: defaultMangapressSettings,
            format: 'cbz',
            singleBook: true,
          },
          { onProgress: vi.fn() },
        ),
      ).rejects.toMatchObject({ code: 'invalid_settings' });

      expect(ports.bindBatch).not.toHaveBeenCalled();
    });

    it('stops before starting the next title once cancelled, and still releases the workspace', async () => {
      const ports = dependencies();
      const controller = new AbortController();
      // Simulates the real subprocess adapter: an in-flight convert() rejects once its signal aborts.
      ports.convert.mockImplementationOnce(() => {
        controller.abort();
        return Promise.reject(new Error('aborted'));
      });
      const { workflow, sessionId } = await openLibrary(ports);

      const outcomes = await workflow.convertLibrary(
        {
          sessionId,
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
      expect(ports.release).toHaveBeenCalledWith('batch-workspace');
    });

    it('restricts conversion to the requested titles when running only some of them', async () => {
      const ports = dependencies();
      const { workflow, sessionId } = await openLibrary(ports);

      const outcomes = await workflow.convertLibrary(
        {
          sessionId,
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
});

describe('single-input workflow process modes', () => {
  const invalidSettings = { ...defaultMangapressSettings, deviceProfile: '' };

  function folderWorkflow(ports: ReturnType<typeof dependencies>) {
    let id = 0;
    return new SingleInputWorkflow(
      ports.binding,
      ports.conversion,
      () => `id-${String(++id)}`,
      ports.bookFiles,
    );
  }

  it('joins a folder and saves the volumes as books without ever running mangapress', async () => {
    const ports = dependencies();
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(folder);
    const progress: ConversionProgress[] = [];
    const landed: ConversionArtifact[] = [];

    const artifacts = await workflow.convert(
      {
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        // Settings mangapress would reject are irrelevant when mangapress is not run.
        settings: invalidSettings,
        format: 'epub',
        mapping: mappedDraft(),
        mode: 'bind-only',
      },
      {
        onProgress: (update) => progress.push(update),
        onArtifact: (artifact) => landed.push(artifact),
      },
    );

    expect(ports.convert).not.toHaveBeenCalled();
    expect(ports.saveBook.mock.calls.map(([request]) => request)).toEqual([
      { sourcePath: '/work/volume-1.cbz', libraryPath: '/library' },
      { sourcePath: '/work/volume-2.cbz', libraryPath: '/library' },
    ]);
    expect(artifacts).toEqual([
      {
        id: 'id-2',
        name: 'volume-1.cbz',
        path: '/library/volume-1.cbz',
        bytes: 1234,
        format: 'cbz',
        title: 'volume-1',
        author: 'Unknown',
      },
      {
        id: 'id-3',
        name: 'volume-2.cbz',
        path: '/library/volume-2.cbz',
        bytes: 1234,
        format: 'cbz',
        title: 'volume-2',
        author: 'Unknown',
      },
    ]);
    expect(landed).toEqual(artifacts);
    expect(progress).toEqual([
      { stage: 'binding', message: 'Organizing 2 chapters into volume files…' },
      { stage: 'saving', volume: '1 of 2', message: 'Saving volume 1 of 2…' },
      { stage: 'saving', volume: '2 of 2', message: 'Saving volume 2 of 2…' },
      { stage: 'saving', message: '2 books saved.' },
    ]);
  });

  it('sends a folder straight to mangapress as one book when it is not grouped', async () => {
    const ports = dependencies();
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(folder);

    await workflow.convert(
      {
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'epub',
        mode: 'convert-only',
      },
      { onProgress: vi.fn() },
    );

    expect(ports.bind).not.toHaveBeenCalled();
    expect(ports.saveBook).not.toHaveBeenCalled();
    expect(ports.convert).toHaveBeenCalledOnce();
    // The tool writes into a folder of its own; the book is published into the library afterwards.
    expect(ports.convert).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPath: '/input/Trusted Manga',
        outputDirectory: '/library/.mangabound/incoming/staged',
      }),
      expect.anything(),
    );
  });

  it('reports the name and path a book was published under, not the name the tool gave it', async () => {
    const ports = dependencies();
    ports.bookFiles.stageBook = async (request, produce) => {
      const produced = await produce('/library/.mangabound/incoming/one');
      return {
        produced,
        saved: {
          path: `${request.libraryPath}/Standalone (2).epub`,
          name: 'Standalone (2).epub',
          bytes: 7,
        },
      };
    };
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(folder);
    const artifacts: ConversionArtifact[] = [];

    await workflow.convert(
      {
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'epub',
        mode: 'convert-only',
      },
      { onProgress: vi.fn(), onArtifact: (artifact) => artifacts.push(artifact) },
    );

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      name: 'Standalone (2).epub',
      path: '/library/Standalone (2).epub',
      bytes: 7,
      title: 'Standalone',
    });
  });

  it('reports a book that cannot be published as publish_failed, and a failed conversion as it was', async () => {
    const disk = new Error('disk full');
    const ports = dependencies();
    ports.bookFiles.stageBook = async (_request, produce) => {
      await produce('/library/.mangabound/incoming/one');
      throw disk;
    };
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(folder);
    const request = {
      sessionId: inspected.sessionId,
      libraryPath: '/library',
      settings: defaultMangapressSettings,
      format: 'epub' as const,
      mode: 'convert-only' as const,
    };

    await expect(workflow.convert(request, { onProgress: vi.fn() })).rejects.toMatchObject({
      code: 'publish_failed',
      cause: disk,
    });

    const broken = new Error('mangapress exited with code 1');
    ports.convert.mockRejectedValueOnce(broken);
    ports.bookFiles.stageBook = async (_request, produce) => ({
      produced: await produce('/library/.mangabound/incoming/two'),
      saved: { path: '/library/x.epub', name: 'x.epub', bytes: 1 },
    });
    await expect(workflow.convert(request, { onProgress: vi.fn() })).rejects.toBe(broken);
  });

  it('keeps a cancellation a cancellation even when it interrupts the publishing', async () => {
    const ports = dependencies();
    const controller = new AbortController();
    ports.bookFiles.stageBook = async (_request, produce) => {
      await produce('/library/.mangabound/incoming/one');
      controller.abort();
      throw controller.signal.reason;
    };
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(folder);

    await expect(
      workflow.convert(
        {
          sessionId: inspected.sessionId,
          libraryPath: '/library',
          settings: defaultMangapressSettings,
          format: 'epub',
          mode: 'convert-only',
        },
        { onProgress: vi.fn(), signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('still validates the mangapress settings when mangapress will run', async () => {
    const ports = dependencies();
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(folder);

    await expect(
      workflow.convert(
        {
          sessionId: inspected.sessionId,
          libraryPath: '/library',
          settings: invalidSettings,
          format: 'epub',
          mode: 'convert-only',
        },
        { onProgress: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'invalid_settings' });
  });

  it('refuses to join a CBZ, since it is already one volume, for both convert and plan', async () => {
    const ports = dependencies();
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(cbz);
    const request = {
      sessionId: inspected.sessionId,
      libraryPath: '/library',
      settings: defaultMangapressSettings,
      format: 'epub',
      mode: 'bind-only',
    } as const;

    await expect(workflow.convert(request, { onProgress: vi.fn() })).rejects.toMatchObject({
      code: 'unsupported_mode',
    });
    await expect(workflow.convert(request, { onProgress: vi.fn() })).rejects.toThrow(
      /already one volume/u,
    );
    await expect(workflow.plan(request)).rejects.toMatchObject({ code: 'unsupported_mode' });
    expect(ports.saveBook).not.toHaveBeenCalled();
  });

  it('reports no volumes when joining produces nothing to save', async () => {
    const ports = dependencies({ volumePaths: [] });
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(folder);

    await expect(
      workflow.convert(
        {
          sessionId: inspected.sessionId,
          libraryPath: '/library',
          settings: defaultMangapressSettings,
          format: 'epub',
          mapping: mappedDraft(),
          mode: 'bind-only',
        },
        { onProgress: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'no_volumes' });
    expect(ports.saveBook).not.toHaveBeenCalled();
  });

  it('wraps a failure to save as publish_failed but keeps reporting the books already saved', async () => {
    const ports = dependencies();
    const disk = new Error('ENOSPC: no space left on device');
    ports.saveBook
      .mockResolvedValueOnce({ path: '/library/volume-1.cbz', name: 'volume-1.cbz', bytes: 10 })
      .mockRejectedValueOnce(disk);
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(folder);
    const landed: ConversionArtifact[] = [];

    const failure = workflow.convert(
      {
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'epub',
        mapping: mappedDraft(),
        mode: 'bind-only',
      },
      { onProgress: vi.fn(), onArtifact: (artifact) => landed.push(artifact) },
    );

    await expect(failure).rejects.toMatchObject({ code: 'publish_failed', cause: disk });
    expect(landed.map((artifact) => artifact.name)).toEqual(['volume-1.cbz']);
  });

  it('does not wrap a cancellation, and never starts saving once cancelled', async () => {
    const ports = dependencies();
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(folder);
    const request = {
      sessionId: inspected.sessionId,
      libraryPath: '/library',
      settings: defaultMangapressSettings,
      format: 'epub',
      mapping: mappedDraft(),
      mode: 'bind-only',
    } as const;

    const before = new AbortController();
    before.abort();
    await expect(
      workflow.convert(request, { onProgress: vi.fn(), signal: before.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(ports.saveBook).not.toHaveBeenCalled();

    const during = new AbortController();
    ports.saveBook.mockImplementationOnce(() => {
      during.abort();
      return Promise.reject(during.signal.reason as Error);
    });
    await expect(
      workflow.convert(request, { onProgress: vi.fn(), signal: during.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(ports.saveBook).toHaveBeenCalledOnce();
  });

  it('reports each converted book as it lands, in the ordinary mode too', async () => {
    const ports = dependencies();
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(folder);
    const landed: string[] = [];

    await workflow.convert(
      {
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'epub',
        mapping: mappedDraft(),
      },
      { onProgress: vi.fn(), onArtifact: (artifact) => landed.push(artifact.id) },
    );

    expect(landed).toEqual(['artifact-/work/volume-1.cbz', 'artifact-/work/volume-2.cbz']);
  });

  it('spends the session after a success, and keeps it after a failure so a retry needs no re-scan', async () => {
    const ports = dependencies();
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(folder);
    const request = {
      sessionId: inspected.sessionId,
      libraryPath: '/library',
      settings: defaultMangapressSettings,
      format: 'epub',
      mapping: mappedDraft(),
    } as const;

    ports.convert.mockRejectedValueOnce(new Error('mangapress crashed'));
    await expect(workflow.convert(request, { onProgress: vi.fn() })).rejects.toThrow(/crashed/u);
    expect(ports.release).not.toHaveBeenCalled();

    await workflow.convert(request, { onProgress: vi.fn() });
    expect(ports.release).toHaveBeenCalledExactlyOnceWith('workspace-1');
    await expect(workflow.convert(request, { onProgress: vi.fn() })).rejects.toMatchObject({
      code: 'session_not_found',
    });
  });

  it('validates a joined-only plan with mangabind and says mangapress is not run', async () => {
    const ports = dependencies();
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(folder);

    await expect(
      workflow.plan({
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: invalidSettings,
        format: 'epub',
        mapping: mappedDraft(),
        mode: 'bind-only',
      }),
    ).resolves.toMatchObject({
      tool: 'mangabind',
      message:
        'mangabind validated 2 volumes · saved as CBZ files, mangapress not run · no library files written',
    });
    expect(ports.conversionPlan).not.toHaveBeenCalled();
  });

  it('validates an ungrouped folder with mangapress as a single book, needing no mapping', async () => {
    const ports = dependencies();
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(folder);

    await expect(
      workflow.plan({
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'epub',
        mode: 'convert-only',
      }),
    ).resolves.toEqual({
      tool: 'mangapress',
      title: 'Standalone',
      message:
        'mangapress validated KV · 1072 × 1448 · one book, chapters not grouped · no library files written',
      books: [{ name: 'Standalone.epub', pageCount: 3 }],
      issues: [],
    });
    expect(ports.conversionPlan).toHaveBeenCalledWith(
      expect.objectContaining({ inputPath: '/input/Trusted Manga' }),
      {},
    );
    expect(ports.bindingPlan).not.toHaveBeenCalled();
  });

  it('rejects invalid settings on a plan that will run mangapress', async () => {
    const ports = dependencies();
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(folder);

    await expect(
      workflow.plan({
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: invalidSettings,
        format: 'epub',
        mode: 'convert-only',
      }),
    ).rejects.toMatchObject({ code: 'invalid_settings' });
  });

  describe('a library', () => {
    const libraryRequest = {
      libraryPath: '/output',
      settings: defaultMangapressSettings,
      format: 'epub',
    } as const;

    it('joins every title and saves the volumes as books, skipping mangapress and its settings', async () => {
      const ports = dependencies();
      const { workflow, sessionId } = await openLibrary(ports);
      const progress: ConversionProgress[] = [];
      const landed: string[] = [];

      const outcomes = await workflow.convertLibrary(
        { ...libraryRequest, sessionId, settings: invalidSettings, mode: 'bind-only' },
        {
          onProgress: (update) => progress.push(update),
          onArtifact: (artifact) => landed.push(artifact.name),
        },
      );

      expect(ports.convert).not.toHaveBeenCalled();
      expect(outcomes.map((outcome) => [outcome.title, outcome.status])).toEqual([
        ['Good Manga', 'done'],
        ['Broken Manga', 'failed'],
      ]);
      expect(outcomes[0]?.artifacts.map((artifact) => [artifact.name, artifact.format])).toEqual([
        ['good-vol-1.cbz', 'cbz'],
        ['good-vol-2.cbz', 'cbz'],
      ]);
      expect(landed).toEqual(['good-vol-1.cbz', 'good-vol-2.cbz']);
      expect(progress).toEqual([
        { stage: 'binding', message: 'Building volume files for the library…' },
        {
          stage: 'saving',
          title: 'Good Manga',
          volume: '1 of 2',
          message: 'Saving Good Manga · volume 1 of 2…',
        },
        {
          stage: 'saving',
          title: 'Good Manga',
          volume: '2 of 2',
          message: 'Saving Good Manga · volume 2 of 2…',
        },
      ]);
      expect(ports.release).toHaveBeenCalledWith('batch-workspace');
    });

    it('isolates a title whose volumes could not be saved, and still releases the workspace', async () => {
      const ports = dependencies();
      ports.saveBook.mockRejectedValueOnce(new Error('EACCES'));
      const { workflow, sessionId } = await openLibrary(ports);

      const outcomes = await workflow.convertLibrary(
        { ...libraryRequest, sessionId, mode: 'bind-only' },
        { onProgress: vi.fn() },
      );

      expect(outcomes[0]).toMatchObject({
        title: 'Good Manga',
        status: 'failed',
        artifacts: [],
        error: { code: 'publish_failed' },
      });
      expect(ports.release).toHaveBeenCalledWith('batch-workspace');
    });

    it('reports each converted book as it lands in the ordinary mode too', async () => {
      const ports = dependencies();
      const { workflow, sessionId } = await openLibrary(ports);
      const landed: string[] = [];

      await workflow.convertLibrary(
        { ...libraryRequest, sessionId },
        {
          onProgress: vi.fn(),
          onArtifact: (artifact) => landed.push(artifact.id),
        },
      );

      expect(landed).toEqual([
        'artifact-/work/batch/good-vol-1.cbz',
        'artifact-/work/batch/good-vol-2.cbz',
      ]);
    });

    it('keeps the title in aggregate progress when its volumes convert concurrently', async () => {
      const ports = dependencies();
      const originalBindBatch = ports.bindBatch.getMockImplementation()!;
      ports.bindBatch.mockImplementation((parentPath, signal, combine, onBindingProgress) => {
        onBindingProgress?.({ stage: 'inspect', state: 'started', manga: 'Good Manga' });
        return originalBindBatch(parentPath, signal, combine, onBindingProgress);
      });
      const { workflow, sessionId } = await openLibrary(ports, 2);
      const progress: ConversionProgress[] = [];

      const outcomes = await workflow.convertLibrary(
        { ...libraryRequest, sessionId },
        { onProgress: (update) => progress.push(update) },
      );

      expect(outcomes[0]).toMatchObject({ title: 'Good Manga', status: 'done' });
      expect(progress).toContainEqual({
        stage: 'binding',
        title: 'Good Manga',
        message: 'Inspecting Good Manga…',
      });
      expect(progress).toContainEqual(
        expect.objectContaining({
          title: 'Good Manga',
          message: 'Good Manga · 2 of 2 volumes converted.',
          total: 2,
          completed: 2,
        }),
      );
    });

    it('still validates the mangapress settings when mangapress will run', async () => {
      const ports = dependencies();
      const { workflow, sessionId } = await openLibrary(ports);

      await expect(
        workflow.convertLibrary(
          { ...libraryRequest, sessionId, settings: invalidSettings },
          { onProgress: vi.fn() },
        ),
      ).rejects.toMatchObject({ code: 'invalid_settings' });
    });
  });
});

describe('the title, author and language typed for a book', () => {
  function folderWorkflow(ports: ReturnType<typeof dependencies>) {
    let id = 0;
    return new SingleInputWorkflow(
      ports.binding,
      ports.conversion,
      () => `id-${String(++id)}`,
      ports.bookFiles,
    );
  }

  const typed = { title: 'Chainsaw Man', author: 'Fujimoto Tatsuki', language: 'pt-br' };
  const booksOf = (ports: ReturnType<typeof dependencies>) =>
    ports.convert.mock.calls.map(([request]) => request.book);

  it('titles each volume of a series after the title typed for it, with the same author and language', async () => {
    const ports = dependencies();
    ports.bind.mockResolvedValue({
      volumes: [
        { number: 1, path: '/work/volume-1.cbz' },
        { number: 3.5, path: '/work/volume-3.5.cbz' },
        { number: 12, path: '/work/volume-12.cbz' },
      ],
      issues: [],
    });
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(folder);

    await workflow.convert(
      {
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'epub',
        mapping: mappedDraft(),
        details: typed,
      },
      { onProgress: vi.fn() },
    );

    expect(booksOf(ports)).toEqual([
      { ...typed, title: 'Chainsaw Man - Vol.01' },
      { ...typed, title: 'Chainsaw Man - Vol.3.5' },
      { ...typed, title: 'Chainsaw Man - Vol.12' },
    ]);
  });

  it('uses the title as it stands for one book that is not a volume of a series', async () => {
    const ports = dependencies();
    const workflow = folderWorkflow(ports);
    const cbzSession = await workflow.inspect(cbz);
    const folderSession = await workflow.inspect(folder);
    const request = {
      libraryPath: '/library',
      settings: defaultMangapressSettings,
      format: 'epub',
      details: typed,
    } as const;

    await workflow.convert(
      { ...request, sessionId: cbzSession.sessionId },
      { onProgress: vi.fn() },
    );
    await workflow.convert(
      { ...request, sessionId: folderSession.sessionId, mode: 'convert-only' },
      { onProgress: vi.fn() },
    );

    expect(booksOf(ports)).toEqual([typed, typed]);
  });

  it('uses the title as it stands for the whole series made into one book', async () => {
    const ports = dependencies();
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(folder);

    await workflow.convert(
      {
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'epub',
        singleBook: true,
        mapping: mappedDraft(),
        details: typed,
      },
      { onProgress: vi.fn() },
    );

    expect(booksOf(ports)).toEqual([typed]);
  });

  it('adds nothing for a book nothing was typed for, so the tools use their own defaults', async () => {
    const ports = dependencies();
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(folder);

    await workflow.convert(
      {
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'epub',
        mapping: mappedDraft(),
      },
      { onProgress: vi.fn() },
    );

    expect(booksOf(ports)).toEqual([{}, {}]);
  });

  it('ignores them when only joining, because no book is made by mangapress', async () => {
    const ports = dependencies();
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(folder);

    await workflow.convert(
      {
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'epub',
        mapping: mappedDraft(),
        mode: 'bind-only',
        details: typed,
      },
      { onProgress: vi.fn() },
    );

    expect(ports.convert).not.toHaveBeenCalled();
    expect(ports.saveBook).toHaveBeenCalledTimes(2);
  });

  it('is what the plan of a book converted whole is made with', async () => {
    const ports = dependencies();
    const workflow = folderWorkflow(ports);
    const inspected = await workflow.inspect(cbz);

    await workflow.plan(
      {
        sessionId: inspected.sessionId,
        libraryPath: '/library',
        settings: defaultMangapressSettings,
        format: 'epub',
        details: typed,
      },
      {},
    );

    expect(ports.conversionPlan.mock.calls[0]?.[0].book).toEqual(typed);
  });

  describe('in a library', () => {
    const titleDetails = [{ title: 'Good Manga', details: typed }];

    it('goes to the title it was typed for, and nothing else gets any', async () => {
      const ports = dependencies();
      ports.bindBatch.mockResolvedValue({
        workspaceId: 'batch-workspace',
        titles: [
          {
            title: 'Good Manga',
            status: 'completed',
            volumes: numbered(['/work/batch/good-1.cbz', '/work/batch/good-2.cbz']),
            issues: [],
          },
          {
            title: 'Other Manga',
            status: 'completed',
            volumes: numbered(['/work/batch/other-1.cbz']),
            issues: [],
          },
        ],
        issues: [],
      });
      const { workflow, sessionId } = await openLibrary(ports);

      await workflow.convertLibrary(
        {
          sessionId,
          libraryPath: '/output',
          settings: defaultMangapressSettings,
          format: 'epub',
          titleDetails,
        },
        { onProgress: vi.fn() },
      );

      expect(booksOf(ports)).toEqual([
        { ...typed, title: 'Chainsaw Man - Vol.01' },
        { ...typed, title: 'Chainsaw Man - Vol.02' },
        {},
      ]);
    });

    it('titles the one book of each title when the series is made into one', async () => {
      const ports = dependencies();
      const { workflow, sessionId } = await openLibrary(ports);

      await workflow.convertLibrary(
        {
          sessionId,
          libraryPath: '/output',
          settings: defaultMangapressSettings,
          format: 'epub',
          singleBook: true,
          titleDetails,
        },
        { onProgress: vi.fn() },
      );

      expect(booksOf(ports)).toEqual([typed]);
    });

    it('is ignored when only joining', async () => {
      const ports = dependencies();
      const { workflow, sessionId } = await openLibrary(ports);

      await workflow.convertLibrary(
        {
          sessionId,
          libraryPath: '/output',
          settings: defaultMangapressSettings,
          format: 'epub',
          mode: 'bind-only',
          titleDetails,
        },
        { onProgress: vi.fn() },
      );

      expect(ports.convert).not.toHaveBeenCalled();
    });
  });
});

describe('the author and language kept with a folder', () => {
  function workflowFor(ports: ReturnType<typeof dependencies>) {
    let id = 0;
    return new SingleInputWorkflow(
      ports.binding,
      ports.conversion,
      () => `id-${String(++id)}`,
      ports.bookFiles,
    );
  }
  const kept = { author: 'Fujimoto Tatsuki', language: 'pt-br' };

  describe('are read when a folder is', () => {
    it('told with the folder, when it holds any', async () => {
      const ports = dependencies();
      ports.readDetails.mockResolvedValue(kept);

      const inspected = await workflowFor(ports).inspect(folder);

      expect(ports.readDetails).toHaveBeenCalledExactlyOnceWith('/input/Trusted Manga');
      expect(inspected.details).toEqual(kept);
    });

    it('left out of what is told when the folder holds none, and never asked of a loose CBZ', async () => {
      const ports = dependencies();
      const workflow = workflowFor(ports);

      const read = await workflow.inspect(folder);
      const direct = await workflow.inspect(cbz);

      expect(read).not.toHaveProperty('details');
      expect(direct).not.toHaveProperty('details');
      expect(ports.readDetails).toHaveBeenCalledTimes(1);
    });

    it('told with each title of a library, and again when the library is read again', async () => {
      const ports = dependencies();
      ports.readDetails.mockImplementation((inputPath) =>
        Promise.resolve(inputPath === '/library/Good Manga' ? kept : {}),
      );
      const { workflow, sessionId } = await openLibrary(ports);

      const first = await workflow.planLibrary(sessionId);

      expect(first.titles.map((title) => [title.title, title.details])).toEqual([
        ['Good Manga', kept],
      ]);
      expect(ports.readDetails).toHaveBeenCalledWith('/library/Good Manga');
    });

    it('told with the titles of a library the first time it is opened', async () => {
      const ports = dependencies();
      ports.readDetails.mockResolvedValue(kept);
      ports.inspect.mockResolvedValue({
        workspaceId: 'workspace-1',
        draft: libraryRead,
        issues: [],
      });
      const workflow = workflowFor(ports);

      const inspected = await workflow.inspect(library);

      expect(inspected.kind).toBe('library');
      expect(inspected.titles?.map((title) => title.details)).toEqual([kept]);
      // The library itself is not a folder that keeps details, only its titles are.
      expect(ports.readDetails).not.toHaveBeenCalledWith('/input/Library');
    });
  });

  describe('are kept when asked', () => {
    it('with the folder of an input', async () => {
      const ports = dependencies();
      const workflow = workflowFor(ports);
      const inspected = await workflow.inspect(folder);

      await workflow.saveDetails(inspected.sessionId, kept);

      expect(ports.writeDetails).toHaveBeenCalledExactlyOnceWith('/input/Trusted Manga', kept);
    });

    it('with the folder of a title of a library, found in what was read', async () => {
      const ports = dependencies();
      const { workflow, sessionId } = await openLibrary(ports);

      await workflow.saveDetails(sessionId, kept, 'Good Manga');

      expect(ports.writeDetails).toHaveBeenCalledExactlyOnceWith('/library/Good Manga', kept);
    });

    it('never for something that is not there or that keeps none', async () => {
      const ports = dependencies();
      const workflow = workflowFor(ports);
      const direct = await workflow.inspect(cbz);
      const inspected = await workflow.inspect(folder);
      const { workflow: libraryWorkflow, sessionId } = await openLibrary(dependencies());

      await expect(workflow.saveDetails('gone', kept)).rejects.toMatchObject({
        code: 'session_not_found',
      });
      await expect(workflow.saveDetails(direct.sessionId, kept)).rejects.toMatchObject({
        code: 'unsupported_mode',
      });
      await expect(
        workflow.saveDetails(inspected.sessionId, kept, 'Good Manga'),
      ).rejects.toMatchObject({
        code: 'not_a_library',
      });
      await expect(libraryWorkflow.saveDetails(sessionId, kept)).rejects.toMatchObject({
        code: 'unsupported_mode',
      });
      await expect(libraryWorkflow.saveDetails(sessionId, kept, 'Not There')).rejects.toMatchObject(
        {
          code: 'title_not_found',
        },
      );
      expect(ports.writeDetails).not.toHaveBeenCalled();
    });

    it('and a failure to keep them is passed on as it is', async () => {
      const ports = dependencies();
      const failure = new Error('read only');
      ports.writeDetails.mockRejectedValue(failure);
      const workflow = workflowFor(ports);
      const inspected = await workflow.inspect(folder);

      await expect(workflow.saveDetails(inspected.sessionId, kept)).rejects.toBe(failure);
    });
  });
});
