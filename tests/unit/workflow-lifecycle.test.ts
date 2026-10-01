import { describe, expect, it, vi } from 'vitest';

import { ConversionWorkflow } from '@/application/workflows/conversion-workflow';
import type { ConversionRequest } from '@/domain/conversion';
import { defaultMangapressSettings } from '@/domain/output-profile';

import {
  cbz,
  dependencies,
  folder,
  library,
  libraryRead,
  mappedDraft,
  trustedDraft,
} from './support/conversion-workflow';

describe('workflow session lifetimes across inputs and runs', () => {
  it('shares inspected sessions across single runs, library runs and metadata saves without spending another input', async () => {
    const ports = dependencies();
    ports.inspect.mockImplementation((inputPath) =>
      Promise.resolve({
        workspaceId: `scratch:${inputPath}`,
        draft: inputPath === library.inputPath ? libraryRead : trustedDraft,
        issues: [],
      }),
    );
    let id = 0;
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => `id-${String(++id)}`,
      ports.bookFiles,
    );
    const manga = await workflow.inspect(folder);
    const direct = await workflow.inspect(cbz);
    const batch = await workflow.inspect(library);
    const request: ConversionRequest = {
      sessionId: manga.sessionId,
      libraryPath: '/pending',
      settings: defaultMangapressSettings,
      format: 'epub',
      mapping: mappedDraft(),
    };
    const error = new Error('First conversion failed');
    ports.convert.mockRejectedValueOnce(error);
    await expect(workflow.convert(request, { onProgress: vi.fn() })).rejects.toBe(error);
    await workflow.saveDetails(manga.sessionId, { author: 'Manga author' });
    expect(ports.writeDetails).toHaveBeenLastCalledWith(folder.inputPath, {
      author: 'Manga author',
    });

    await workflow.convert({ ...request, sessionId: direct.sessionId }, { onProgress: vi.fn() });
    await expect(workflow.plan({ ...request, sessionId: direct.sessionId })).rejects.toMatchObject({
      code: 'session_not_found',
    });
    await expect(workflow.plan(request)).resolves.toMatchObject({ tool: 'mangabind' });

    const outcomes = await workflow.convertLibrary(
      {
        sessionId: batch.sessionId,
        libraryPath: request.libraryPath,
        settings: request.settings,
        format: request.format,
      },
      { onProgress: vi.fn() },
    );
    expect(outcomes.map(({ title, status }) => ({ title, status }))).toEqual([
      { title: 'Good Manga', status: 'done' },
      { title: 'Broken Manga', status: 'failed' },
    ]);
    await workflow.saveDetails(batch.sessionId, { author: 'Library author' }, 'Good Manga');
    expect(ports.writeDetails).toHaveBeenLastCalledWith('/library/Good Manga', {
      author: 'Library author',
    });

    expect(await workflow.convert(request, { onProgress: vi.fn() })).toHaveLength(2);
    await expect(workflow.plan(request)).rejects.toMatchObject({ code: 'session_not_found' });
    await expect(workflow.planLibrary(batch.sessionId)).resolves.toMatchObject({
      titles: [{ title: 'Good Manga' }],
    });
    await workflow.releaseAll();
    await expect(workflow.planLibrary(batch.sessionId)).rejects.toMatchObject({
      code: 'session_not_found',
    });
    expect(ports.inspect).toHaveBeenCalledTimes(2);
    expect(ports.release.mock.calls.map(([workspace]) => workspace)).toEqual([
      `scratch:${library.inputPath}`,
      'batch-workspace',
      `scratch:${folder.inputPath}`,
    ]);
  });

  it('forgets a released session before scratch cleanup can fail, leaving other inputs available', async () => {
    const ports = dependencies();
    let id = 0;
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => `id-${String(++id)}`,
      ports.bookFiles,
    );
    const manga = await workflow.inspect(folder);
    const direct = await workflow.inspect(cbz);
    const error = new Error('Scratch cleanup failed');
    ports.release.mockRejectedValueOnce(error);

    await expect(workflow.release(manga.sessionId)).rejects.toBe(error);
    await expect(
      workflow.plan({
        sessionId: manga.sessionId,
        libraryPath: '/pending',
        settings: defaultMangapressSettings,
        format: 'epub',
        mapping: mappedDraft(),
      }),
    ).rejects.toMatchObject({ code: 'session_not_found' });
    await expect(
      workflow.plan({
        sessionId: direct.sessionId,
        libraryPath: '/pending',
        settings: defaultMangapressSettings,
        format: 'epub',
      }),
    ).resolves.toMatchObject({ tool: 'mangapress' });
    await workflow.release(manga.sessionId);
    await workflow.releaseAll();
    expect(ports.release).toHaveBeenCalledExactlyOnceWith('workspace-1');
  });
});
