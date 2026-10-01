import { describe, expect, it, vi } from 'vitest';
import { ConversionWorkflow } from '@/application/workflows/conversion-workflow';
import { createMappingDraft } from '@/domain/mapping';
import { defaultMangapressSettings } from '@/domain/output-profile';

import {
  trustedDraft,
  mappedDraft,
  numbered,
  dependencies,
  folder,
  library,
  libraryRead,
  openLibrary,
} from './support/conversion-workflow';

describe('library conversion workflow', () => {
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
    const workflow = new ConversionWorkflow(
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
    const workflow = new ConversionWorkflow(
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
    const workflow = new ConversionWorkflow(
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
    const workflow = new ConversionWorkflow(
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
    const workflow = new ConversionWorkflow(
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

  it('returns completed books in a failed library title and continues with the other titles', async () => {
    const ports = dependencies();
    const error = new Error('Volume 2 failed');
    const convert = ports.convert.getMockImplementation()!;
    ports.convert.mockImplementation((request, context) =>
      request.inputPath.endsWith('good-vol-2.cbz')
        ? Promise.reject(error)
        : convert(request, context),
    );
    const bindBatch = ports.bindBatch.getMockImplementation()!;
    ports.bindBatch.mockImplementation(async (...args) => {
      const bound = await bindBatch(...args);
      return {
        ...bound,
        titles: [
          ...bound.titles,
          {
            title: 'Other Manga',
            status: 'completed',
            volumes: numbered(['/work/batch/other-vol-1.cbz']),
            issues: [],
          },
        ],
      };
    });
    const { workflow, sessionId } = await openLibrary(ports);
    const onArtifact = vi.fn();
    const outcomes = await workflow.convertLibrary(
      {
        sessionId,
        libraryPath: '/output',
        settings: defaultMangapressSettings,
        format: 'epub',
      },
      { onArtifact, onProgress: vi.fn() },
    );
    expect(outcomes[0]).toMatchObject({ title: 'Good Manga', status: 'failed', error });
    expect(outcomes[0]!.artifacts).toHaveLength(1);
    expect(outcomes[0]!.artifacts[0]).toMatchObject({
      id: 'artifact-/work/batch/good-vol-1.cbz',
    });
    expect(onArtifact).toHaveBeenNthCalledWith(1, outcomes[0]!.artifacts[0]);
    expect(outcomes[1]).toMatchObject({
      title: 'Broken Manga',
      status: 'failed',
      artifacts: [],
      error: { code: 'binding_failed' },
    });
    expect(outcomes[2]).toMatchObject({ title: 'Other Manga', status: 'done' });
    expect(outcomes[2]!.artifacts).toHaveLength(1);
    expect(onArtifact).toHaveBeenNthCalledWith(2, outcomes[2]!.artifacts[0]);
    expect(onArtifact).toHaveBeenCalledTimes(2);
    expect(ports.release).toHaveBeenLastCalledWith('batch-workspace');
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
