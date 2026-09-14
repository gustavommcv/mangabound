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

  it('edits a provider suggestion with the same controls and supports undo and redo', async () => {
    const user = userEvent.setup();
    render(
      <MappingEditor
        initialDraft={createMappingDraft({
          mangaTitle: 'Suggested Work',
          chapters,
          source: { provider: 'MangaDex', id: 'work-id' },
          volumes: [
            { id: 'volume-1', number: '1', chapterIds: ['chapter-1', 'chapter-2'] },
            { id: 'volume-2', number: '2', chapterIds: ['chapter-3'] },
          ],
        })}
      />,
    );

    expect(screen.getByText('Suggested by MangaDex')).toBeVisible();
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
});
