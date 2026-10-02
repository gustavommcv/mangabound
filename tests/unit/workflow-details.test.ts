import { describe, expect, it, vi } from 'vitest';
import { ConversionWorkflow } from '@/application/workflows/conversion-workflow';
import { defaultMangapressSettings } from '@/domain/output-profile';

import {
  mappedDraft,
  numbered,
  dependencies,
  folder,
  cbz,
  openLibrary,
} from './support/conversion-workflow';

describe('the title, author and language typed for a book', () => {
  function folderWorkflow(ports: ReturnType<typeof dependencies>) {
    let id = 0;
    return new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => `id-${String(++id)}`,
      ports.bookFiles,
    );
  }

  const typed = { title: 'Chainsaw Man', author: 'Fujimoto Tatsuki', language: 'pt-BR' };
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
