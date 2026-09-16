import { describe, expect, it } from 'vitest';

import {
  applyCorrectedMapping,
  applyTitleResult,
  createBatchState,
  retryTitle,
  startConversion,
  type BatchDiscovery,
} from '@/domain/batch';
import { createMappingDraft, type MappingDraft } from '@/domain/mapping';

const goodDraft = createMappingDraft({
  mangaTitle: 'Good Manga',
  chapters: [{ id: 'c1', name: 'Chapter 1', path: '/library/Good Manga/Chapter 1', pageCount: 2 }],
  volumes: [{ id: 'v1', number: '1', chapterIds: ['c1'] }],
});
const brokenDraft = createMappingDraft({
  mangaTitle: 'Broken Manga',
  chapters: [
    { id: 'c1', name: 'Chapter 1', path: '/library/Broken Manga/Chapter 1', pageCount: 1 },
  ],
});

function discovery(): BatchDiscovery {
  return {
    titles: [
      {
        title: 'Good Manga',
        inputPath: '/library/Good Manga',
        status: 'completed',
        draft: goodDraft,
        volumes: [{ name: 'Good Manga - Vol.01.cbz', pageCount: 2 }],
        issues: [],
      },
      {
        // Real mangabind reports this as 'completed_with_warnings', not 'failed', when it
        // simply couldn't group any chapters into a volume — classification must key off
        // an empty `volumes` array, not the discovery status label.
        title: 'Broken Manga',
        inputPath: '/library/Broken Manga',
        status: 'completed_with_warnings',
        draft: brokenDraft,
        volumes: [],
        issues: [
          {
            tool: 'mangabind',
            severity: 'warning',
            code: 'no_volumes_produced',
            stage: 'group',
            recoverable: true,
            message: 'No volumes could be produced from the inspected chapters.',
          },
        ],
      },
    ],
    issues: [],
  };
}

describe('batch state', () => {
  it('starts titles with zero discovered volumes in needsMapping, regardless of status label', () => {
    const state = createBatchState(discovery());

    expect(state.titles).toMatchObject([
      { title: 'Good Manga', status: 'ready' },
      { title: 'Broken Manga', status: 'needsMapping' },
    ]);
  });

  it('applies a corrected mapping to only the matching title and marks it ready', () => {
    const state = createBatchState(discovery());
    const corrected: MappingDraft = { ...brokenDraft, mangaTitle: 'Broken Manga (fixed)' };

    const next = applyCorrectedMapping(state, 'Broken Manga', corrected);

    expect(next.titles).toMatchObject([
      { title: 'Good Manga', status: 'ready', draft: { mangaTitle: 'Good Manga' } },
      {
        title: 'Broken Manga',
        status: 'ready',
        draft: { mangaTitle: 'Broken Manga (fixed)' },
      },
    ]);
  });

  it('moves every ready title into converting and leaves needsMapping titles untouched', () => {
    const state = createBatchState(discovery());

    const next = startConversion(state);

    expect(next.titles).toMatchObject([
      { title: 'Good Manga', status: 'converting' },
      { title: 'Broken Manga', status: 'needsMapping' },
    ]);
  });

  it('restricts converting to the requested titles, e.g. when retrying just one', () => {
    let state = createBatchState(discovery());
    state = applyCorrectedMapping(state, 'Broken Manga', brokenDraft);

    const next = startConversion(state, ['Broken Manga']);

    expect(next.titles).toMatchObject([
      { title: 'Good Manga', status: 'ready' },
      { title: 'Broken Manga', status: 'converting' },
    ]);
  });

  it('records a successful outcome on its title without touching the others', () => {
    const state = startConversion(createBatchState(discovery()));

    const next = applyTitleResult(state, {
      title: 'Good Manga',
      status: 'done',
      artifacts: [{ id: 'artifact-1', name: 'Good Manga.epub', bytes: 2048, format: 'epub' }],
    });

    expect(next.titles).toMatchObject([
      {
        title: 'Good Manga',
        status: 'done',
        artifacts: [{ id: 'artifact-1' }],
      },
      { title: 'Broken Manga', status: 'needsMapping' },
    ]);
  });

  it('records a failure with its structured failure detail', () => {
    const state = startConversion(createBatchState(discovery()));

    const next = applyTitleResult(state, {
      title: 'Good Manga',
      status: 'failed',
      artifacts: [],
      failure: { code: 'process_failed', message: 'mangapress crashed.' },
    });

    expect(next.titles[0]).toMatchObject({
      title: 'Good Manga',
      status: 'failed',
      failure: { code: 'process_failed', message: 'mangapress crashed.' },
    });
  });

  it('retries a failed title back to ready and clears its failure', () => {
    let state = startConversion(createBatchState(discovery()));
    state = applyTitleResult(state, {
      title: 'Good Manga',
      status: 'failed',
      artifacts: [],
      failure: { code: 'process_failed', message: 'mangapress crashed.' },
    });

    const next = retryTitle(state, 'Good Manga');

    expect(next.titles[0]).toMatchObject({ title: 'Good Manga', status: 'ready' });
    expect(next.titles[0]!.failure).toBeUndefined();
  });

  it('leaves a title untouched when retrying a title that is not currently failed', () => {
    const state = createBatchState(discovery());

    const next = retryTitle(state, 'Good Manga');

    expect(next).toEqual(state);
  });
});
