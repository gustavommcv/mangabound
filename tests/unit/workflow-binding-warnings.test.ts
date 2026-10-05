import { describe, expect, it, vi } from 'vitest';

import { ConversionWorkflow } from '@/application/workflows/conversion-workflow';
import type { PipelineIssue } from '@/domain/conversion';
import { defaultMangapressSettings } from '@/domain/output-profile';

import {
  dependencies,
  folder,
  mappedDraft,
  numbered,
  openLibrary,
} from './support/conversion-workflow';

const conflictInVolume2: PipelineIssue = {
  tool: 'mangabind',
  severity: 'warning',
  code: 'chapter_conflict',
  stage: 'group',
  recoverable: true,
  message: 'Volume 2 chapter 2 has 2 conflicting sources; all were skipped.',
  volume: '2',
};

describe('what the joining step left out of the books', () => {
  const request = (sessionId: string) => ({
    sessionId,
    libraryPath: '/pending',
    settings: defaultMangapressSettings,
    format: 'epub' as const,
  });

  it('is told with the book of the volume it is about when a folder is converted', async () => {
    const ports = dependencies();
    ports.bind.mockResolvedValueOnce({
      volumes: numbered(['/work/volume-1.cbz', '/work/volume-2.cbz']),
      issues: [conflictInVolume2],
    });
    let id = 0;
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => `id-${String(++id)}`,
      ports.bookFiles,
    );
    const { sessionId } = await workflow.inspect(folder);

    const artifacts = await workflow.convert(
      { ...request(sessionId), mapping: mappedDraft() },
      { onProgress: vi.fn() },
    );

    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]).not.toHaveProperty('warnings');
    expect(artifacts[1]?.warnings).toEqual([
      { code: 'chapter_conflict', message: conflictInVolume2.message },
    ]);
  });

  it('is told with the one book when the series is bound as one', async () => {
    const ports = dependencies();
    ports.bind.mockResolvedValueOnce({
      volumes: [],
      combinedOutputPath: '/work/combined.cbz',
      issues: [conflictInVolume2],
    });
    let id = 0;
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => `id-${String(++id)}`,
      ports.bookFiles,
    );
    const { sessionId } = await workflow.inspect(folder);

    const artifacts = await workflow.convert(
      { ...request(sessionId), mapping: mappedDraft(), singleBook: true },
      { onProgress: vi.fn() },
    );

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.warnings?.map(({ code }) => code)).toEqual(['chapter_conflict']);
  });

  it('is told with the books of the title it is about when a library is converted', async () => {
    const ports = dependencies();
    const { workflow, sessionId } = await openLibrary(ports);
    ports.bindBatch.mockResolvedValueOnce({
      workspaceId: 'batch-workspace',
      titles: [
        {
          title: 'Good Manga',
          status: 'completed_with_warnings',
          volumes: numbered(['/work/batch/good-vol-1.cbz', '/work/batch/good-vol-2.cbz']),
          issues: [conflictInVolume2],
        },
        {
          title: 'Other Manga',
          status: 'completed',
          volumes: numbered(['/work/batch/other-vol-1.cbz']),
          issues: [],
        },
      ],
      issues: [],
    });

    const outcomes = await workflow.convertLibrary(request(sessionId), { onProgress: vi.fn() });

    const [good, other] = outcomes;
    expect(good?.artifacts[0]).not.toHaveProperty('warnings');
    expect(good?.artifacts[1]?.warnings?.map(({ code }) => code)).toEqual(['chapter_conflict']);
    expect(other?.artifacts[0]).not.toHaveProperty('warnings');
  });

  it('is told with the one book of a title bound as one when a library is converted', async () => {
    const ports = dependencies();
    const { workflow, sessionId } = await openLibrary(ports);

    ports.bindBatch.mockResolvedValueOnce({
      workspaceId: 'batch-workspace',
      titles: [
        {
          title: 'Good Manga',
          status: 'completed_with_warnings',
          volumes: [],
          combinedOutputPath: '/work/batch/good-combined.cbz',
          issues: [conflictInVolume2],
        },
      ],
      issues: [],
    });

    const outcomes = await workflow.convertLibrary(
      { ...request(sessionId), singleBook: true },
      { onProgress: vi.fn() },
    );

    expect(outcomes[0]?.status).toBe('done');
    expect(outcomes[0]?.artifacts[0]?.warnings?.map(({ code }) => code)).toEqual([
      'chapter_conflict',
    ]);
  });
});
