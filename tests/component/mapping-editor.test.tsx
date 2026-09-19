import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createMappingDraft } from '@/domain/mapping';
import { MappingEditor } from '@/renderer/components/mapping/mapping-editor';

const chapters = [
  {
    id: 'chapter-1',
    name: 'Chapter 1',
    path: 'Chapter 001.cbz',
    pageCount: 20,
    chapter: 1,
  },
  {
    id: 'chapter-2',
    name: 'Chapter 2',
    path: 'Chapter 002.cbz',
    pageCount: 22,
    chapter: 2,
  },
  {
    id: 'chapter-3',
    name: 'Chapter 3',
    path: 'Chapter 003.cbz',
    pageCount: 24,
    chapter: 3,
  },
] as const;

describe('mapping editor', () => {
  it('builds and confirms a complete manual mapping without a provider lookup', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <MappingEditor
        initialDraft={createMappingDraft({ mangaTitle: 'Offline Work', chapters })}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('Manual mapping · Offline')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm mapping' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Add volume' }));
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Assign selected' }));

    expect(screen.getByText('All chapters are ready to bind.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Confirm mapping' }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm.mock.calls[0]?.[0]).toBe(
      '{\n  "schema_version": 1,\n  "manga": {\n    "title": "Offline Work"\n  },\n  "volumes": [\n    {\n      "number": "1",\n      "chapters": [\n        "1",\n        "2",\n        "3"\n      ]\n    }\n  ]\n}\n',
    );
    expect(onConfirm.mock.calls[0]?.[0]).not.toContain('source');
  });

  it("opens on mangabind's own grouping, ready to confirm, and says so only while it is unchanged", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <MappingEditor
        initialDraft={createMappingDraft({
          mangaTitle: 'Named Volumes',
          chapters,
          volumes: [
            { id: 'effective-volume-1', number: '1', chapterIds: ['chapter-1', 'chapter-2'] },
            { id: 'effective-volume-2', number: '2', chapterIds: ['chapter-3'] },
          ],
        })}
        onConfirm={onConfirm}
        startedFrom="mangabind"
      />,
    );

    expect(screen.getByText('Grouped by mangabind · Offline')).toBeVisible();
    const chapterThreeRow = screen
      .getByRole('checkbox', { name: 'Select Chapter 3' })
      .closest('div');
    expect(within(chapterThreeRow!).getByText('Volume 2')).toBeVisible();
    // Nothing to fix: it can be confirmed without touching anything.
    expect(screen.getByRole('button', { name: 'Confirm mapping' })).toBeEnabled();

    await user.click(screen.getByRole('checkbox', { name: 'Select Chapter 3' }));
    await user.selectOptions(
      screen.getByLabelText('Move selected chapters to'),
      'effective-volume-1',
    );
    await user.click(screen.getByRole('button', { name: 'Assign selected' }));

    expect(screen.getByText('Manual mapping · Offline')).toBeVisible();
    expect(screen.queryByText('Grouped by mangabind · Offline')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo last mapping edit' }));
    expect(screen.getByText('Grouped by mangabind · Offline')).toBeVisible();
  });

  it('does not claim mangabind grouping for a grouped draft it was not told came from mangabind', () => {
    render(
      <MappingEditor
        initialDraft={createMappingDraft({
          mangaTitle: 'Manual Volumes',
          chapters,
          volumes: [{ id: 'volume-1', number: '1', chapterIds: ['chapter-1'] }],
        })}
      />,
    );

    expect(screen.getByText('Manual mapping · Offline')).toBeVisible();
  });

  it('edits a provider suggestion with the same controls and supports undo and redo', async () => {
    const user = userEvent.setup();
    render(
      <MappingEditor
        initialDraft={createMappingDraft({
          mangaTitle: 'Suggested Work',
          chapters,
          source: { provider: 'External API', id: 'work-id' },
          volumes: [
            { id: 'volume-1', number: '1', chapterIds: ['chapter-1', 'chapter-2'] },
            { id: 'volume-2', number: '2', chapterIds: ['chapter-3'] },
          ],
        })}
      />,
    );

    expect(screen.getByText('Suggested by External API')).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: 'Select Chapter 2' }));
    await user.selectOptions(screen.getByLabelText('Move selected chapters to'), 'volume-2');
    await user.click(screen.getByRole('button', { name: 'Assign selected' }));

    const chapterTwoRow = screen.getByRole('checkbox', { name: 'Select Chapter 2' }).closest('div');
    expect(chapterTwoRow).not.toBeNull();
    expect(within(chapterTwoRow!).getByText('Volume 2')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Undo last mapping edit' }));
    expect(within(chapterTwoRow!).getByText('Volume 1')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Redo last mapping edit' }));
    expect(within(chapterTwoRow!).getByText('Volume 2')).toBeVisible();
  });

  it('assigns an inclusive range and exposes split, merge, and validation states accessibly', async () => {
    const user = userEvent.setup();
    render(
      <MappingEditor
        initialDraft={createMappingDraft({
          mangaTitle: 'Range Work',
          chapters: [{ ...chapters[0], parsedVolume: 9 }, chapters[1], chapters[2]],
          volumes: [
            { id: 'volume-1', number: '1', chapterIds: [] },
            { id: 'volume-2', number: '2', chapterIds: [] },
          ],
        })}
      />,
    );

    await user.selectOptions(screen.getByLabelText('From'), 'chapter-1');
    await user.selectOptions(screen.getByLabelText('Through'), 'chapter-2');
    await user.click(screen.getByRole('button', { name: 'Assign range' }));

    expect(screen.getByRole('button', { name: 'Split volume 1' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Merge into volume 1' })).toBeEnabled();
    expect(screen.getByRole('alert', { name: 'Mapping errors' })).toHaveTextContent(
      /names volume 9/i,
    );
    expect(screen.getByRole('button', { name: 'Confirm mapping' })).toBeDisabled();
  });

  const externalProvider = [{ id: 'external', displayName: 'External API' }] as const;

  it('applies an external API suggestion as an undoable edit without requiring it', async () => {
    const user = userEvent.setup();
    const onSearchMetadata = vi.fn(() =>
      Promise.resolve([{ id: 'work-1', title: 'A Quiet Journey', provider: 'External API' }]),
    );
    const onSuggestVolumes = vi.fn(() =>
      Promise.resolve({ volumes: [{ number: '1', chapterNumbers: [1, 2] }] }),
    );
    render(
      <MappingEditor
        initialDraft={createMappingDraft({ mangaTitle: 'Offline Work', chapters })}
        metadataProviders={externalProvider}
        onSearchMetadata={onSearchMetadata}
        onSuggestVolumes={onSuggestVolumes}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('A Quiet Journey')).toBeVisible();
    expect(onSearchMetadata).toHaveBeenCalledWith(
      'external',
      'Offline Work',
      expect.any(AbortSignal),
    );
    await user.click(screen.getByRole('button', { name: 'Use this' }));

    expect(await screen.findByText('Suggested by External API')).toBeVisible();
    expect(onSuggestVolumes).toHaveBeenCalledWith('external', 'work-1');
    const chapterOneRow = screen.getByRole('checkbox', { name: 'Select Chapter 1' }).closest('div');
    const chapterThreeRow = screen
      .getByRole('checkbox', { name: 'Select Chapter 3' })
      .closest('div');
    expect(within(chapterOneRow!).getByText('Volume 1')).toBeVisible();
    expect(within(chapterThreeRow!).getByText('Unassigned')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Undo last mapping edit' }));
    expect(screen.getByText('Manual mapping · Offline')).toBeVisible();
    expect(within(chapterOneRow!).getByText('Unassigned')).toBeVisible();
  });

  it('never contacts a source until Search is used, and says where the title goes', async () => {
    const user = userEvent.setup();
    const onSearchMetadata = vi.fn(() => Promise.resolve([]));
    render(
      <MappingEditor
        initialDraft={createMappingDraft({ mangaTitle: 'Offline Work', chapters })}
        metadataProviders={externalProvider}
        onSearchMetadata={onSearchMetadata}
        onSuggestVolumes={vi.fn()}
      />,
    );

    expect(screen.getByText('Searching sends the title to External API.')).toBeVisible();
    // Typing alone must not search either.
    await user.type(screen.getByLabelText('Search external metadata'), ' Extra');
    expect(onSearchMetadata).not.toHaveBeenCalled();
    expect(screen.queryByText('No matches found.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearchMetadata).toHaveBeenCalledOnce();
    expect(await screen.findByText('No matches found.')).toBeVisible();
  });

  it('searches on Enter, and disables Search while the title is empty', async () => {
    const user = userEvent.setup();
    const onSearchMetadata = vi.fn(() => Promise.resolve([]));
    render(
      <MappingEditor
        initialDraft={createMappingDraft({ mangaTitle: 'Offline Work', chapters })}
        metadataProviders={externalProvider}
        onSearchMetadata={onSearchMetadata}
        onSuggestVolumes={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Search external metadata');

    await user.clear(input);
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
    await user.keyboard('{Enter}');
    expect(onSearchMetadata).not.toHaveBeenCalled();

    await user.type(input, 'Another Title{Enter}');
    expect(onSearchMetadata).toHaveBeenCalledWith(
      'external',
      'Another Title',
      expect.any(AbortSignal),
    );
  });

  it('aborts a search that a newer one supersedes and one still running when the editor closes', async () => {
    const user = userEvent.setup();
    const signals: AbortSignal[] = [];
    const onSearchMetadata = vi.fn((_providerId: string, _title: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<never>(() => undefined);
    });
    const { unmount } = render(
      <MappingEditor
        initialDraft={createMappingDraft({ mangaTitle: 'Offline Work', chapters })}
        metadataProviders={externalProvider}
        onSearchMetadata={onSearchMetadata}
        onSuggestVolumes={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(signals).toHaveLength(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    unmount();
    expect(signals[1]?.aborted).toBe(true);
  });

  it('lets the user choose between several sources and clears results when the source changes', async () => {
    const user = userEvent.setup();
    const onSearchMetadata = vi.fn((providerId: string) =>
      Promise.resolve([{ id: 'work-1', title: `From ${providerId}`, provider: providerId }]),
    );
    render(
      <MappingEditor
        initialDraft={createMappingDraft({ mangaTitle: 'Offline Work', chapters })}
        metadataProviders={[
          { id: 'first', displayName: 'First Source' },
          { id: 'second', displayName: 'Second Source' },
        ]}
        onSearchMetadata={onSearchMetadata}
        onSuggestVolumes={vi.fn()}
      />,
    );

    expect(screen.getByText('Searching sends the title to First Source.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('From first')).toBeVisible();

    await user.selectOptions(screen.getByLabelText('Source'), 'second');
    expect(screen.queryByText('From first')).not.toBeInTheDocument();
    expect(screen.getByText('Searching sends the title to Second Source.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('From second')).toBeVisible();
    expect(onSearchMetadata).toHaveBeenLastCalledWith(
      'second',
      'Offline Work',
      expect.any(AbortSignal),
    );
  });

  it('keeps every manual control operable when an external API lookup fails', async () => {
    const user = userEvent.setup();
    const onSearchMetadata = vi.fn(() =>
      Promise.reject(new Error('External metadata service is unreachable.')),
    );
    render(
      <MappingEditor
        initialDraft={createMappingDraft({ mangaTitle: 'Offline Work', chapters })}
        metadataProviders={externalProvider}
        onSearchMetadata={onSearchMetadata}
        onSuggestVolumes={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('External metadata service is unreachable.')).toBeVisible();
    expect(screen.getByText('Manual mapping · Offline')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Add volume' }));
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Assign selected' }));

    expect(screen.getByText('All chapters are ready to bind.')).toBeVisible();
  });

  it('shows a readable error when applying a suggestion fails', async () => {
    const user = userEvent.setup();
    render(
      <MappingEditor
        initialDraft={createMappingDraft({ mangaTitle: 'Offline Work', chapters })}
        metadataProviders={externalProvider}
        onSearchMetadata={() =>
          Promise.resolve([{ id: 'work-1', title: 'A Quiet Journey', provider: 'External API' }])
        }
        onSuggestVolumes={() => Promise.reject(new Error('The lookup timed out.'))}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.click(await screen.findByRole('button', { name: 'Use this' }));

    expect(await screen.findByText('The lookup timed out.')).toBeVisible();
    expect(screen.getByText('Manual mapping · Offline')).toBeVisible();
  });

  it('shows no suggestion panel without a source, without callbacks, or with neither', () => {
    const { rerender } = render(
      <MappingEditor initialDraft={createMappingDraft({ mangaTitle: 'Offline Work', chapters })} />,
    );
    expect(screen.queryByText('Suggest from external API')).not.toBeInTheDocument();

    // Callbacks with no provider to send the title to: nothing to offer.
    rerender(
      <MappingEditor
        initialDraft={createMappingDraft({ mangaTitle: 'Offline Work', chapters })}
        metadataProviders={[]}
        onSearchMetadata={vi.fn()}
        onSuggestVolumes={vi.fn()}
      />,
    );
    expect(screen.queryByText('Suggest from external API')).not.toBeInTheDocument();

    // A provider with no way to search it.
    rerender(
      <MappingEditor
        initialDraft={createMappingDraft({ mangaTitle: 'Offline Work', chapters })}
        metadataProviders={externalProvider}
      />,
    );
    expect(screen.queryByText('Suggest from external API')).not.toBeInTheDocument();
  });
});
