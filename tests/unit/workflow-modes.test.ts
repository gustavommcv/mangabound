import { describe, expect, it, vi } from 'vitest';
import { ConversionWorkflow } from '@/application/workflows/conversion-workflow';
import type { ConversionArtifact, ConversionProgress } from '@/domain/conversion';
import { defaultMangapressSettings } from '@/domain/output-profile';

import { mappedDraft, dependencies, folder, cbz, openLibrary } from './support/conversion-workflow';

describe('conversion workflow process modes', () => {
  const invalidSettings = { ...defaultMangapressSettings, deviceProfile: '' };

  function folderWorkflow(ports: ReturnType<typeof dependencies>) {
    let id = 0;
    return new ConversionWorkflow(
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
