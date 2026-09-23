import { render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
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

  it('focuses its own heading as soon as it mounts', () => {
    render(
      <MappingEditor
        initialDraft={createMappingDraft({ mangaTitle: 'Offline Work', chapters })}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('heading', { name: /Organize Offline Work into volumes/u }),
    ).toHaveFocus();
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

  it('names the source of a suggestion by its id when the page has no description of it', () => {
    render(
      <MappingEditor
        initialDraft={createMappingDraft({
          mangaTitle: 'Suggested Work',
          chapters,
          source: { provider: 'gone-source', id: 'work-id' },
        })}
      />,
    );

    expect(screen.getByText('Suggested by gone-source')).toBeVisible();
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
          source: { provider: 'mangadex', id: 'work-id' },
          volumes: [
            { id: 'volume-1', number: '1', chapterIds: ['chapter-1', 'chapter-2'] },
            { id: 'volume-2', number: '2', chapterIds: ['chapter-3'] },
          ],
        })}
        metadataProviders={[
          {
            id: 'mangadex',
            displayName: 'MangaDex',
            homepage: 'https://mangadex.org',
            description: 'Community catalogue',
          },
        ]}
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

  it('says what the number beside Add is, and what Split before does with it', async () => {
    const user = userEvent.setup();
    render(
      <MappingEditor
        initialDraft={createMappingDraft({
          mangaTitle: 'Eleven Volumes',
          chapters,
          volumes: [
            { id: 'volume-1', number: '1', chapterIds: ['chapter-1', 'chapter-2'] },
            { id: 'volume-11', number: '11', chapterIds: ['chapter-3'] },
          ],
        })}
      />,
    );

    // The box holds the number the next volume will get: one above the highest so far.
    const newNumber = screen.getByLabelText('New volume number');
    expect(newNumber).toHaveValue('12');
    // It is a visible label, not one only a screen reader gets, and the text beside it explains both controls.
    expect(screen.getByText('New volume number')).not.toHaveClass('sr-only');
    expect(newNumber).toHaveAccessibleDescription(
      /Add creates an empty volume with the number in the box, which counts up by itself\..*Split before moves the chosen chapter and every one after it into a new volume, numbered one above the highest so far/u,
    );

    // Split before cuts the volume before the chosen chapter and gives the rest that next number.
    await user.click(screen.getByRole('button', { name: 'Split volume 1' }));
    expect(
      screen
        .getAllByLabelText(/^Volume number for volume/u)
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(['1', '12', '11']);

    // The split took 12, so the box moves on: adding now cannot make a second volume 12.
    expect(newNumber).toHaveValue('13');

    // Add uses the box, and the box counts up by itself.
    await user.click(screen.getByRole('button', { name: 'Add volume' }));
    expect(screen.getByLabelText('Volume number for volume 13')).toBeVisible();
    expect(newNumber).toHaveValue('14');
    expect(
      screen
        .getAllByLabelText(/^Volume number for volume/u)
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(['1', '12', '11', '13']);
  });

  it('leaves the number in the box alone when a split is refused', async () => {
    const user = userEvent.setup();
    render(
      <MappingEditor
        initialDraft={createMappingDraft({
          mangaTitle: 'One Volume',
          chapters,
          volumes: [{ id: 'volume-1', number: '1', chapterIds: ['chapter-1', 'chapter-2'] }],
        })}
      />,
    );
    // The chapter chosen to split before is gone from the volume by the time the button is pressed.
    const select = screen.getByLabelText('Split before');
    Object.defineProperty(select, 'value', { configurable: true, value: 'chapter-1' });

    await user.click(screen.getByRole('button', { name: 'Split volume 1' }));

    expect(screen.getByLabelText('New volume number')).toHaveValue('2');
    expect(
      screen.getByText('A split must leave at least one chapter in each volume.'),
    ).toBeVisible();
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

  const mangaDex = {
    id: 'mangadex',
    displayName: 'MangaDex',
    homepage: 'https://mangadex.org',
    description: 'Community catalogue of manga, with volume and chapter data',
  } as const;
  const otherSource = {
    id: 'other',
    displayName: 'Other Source',
    homepage: 'https://other.example',
    description: 'Another catalogue',
  } as const;

  /** Opens the Online source tab and picks a source from the list, as a person would. */
  async function chooseSource(user: UserEvent, name = /MangaDex/u): Promise<void> {
    await user.click(screen.getByRole('tab', { name: 'Online source' }));
    await user.click(screen.getByRole('combobox', { name: 'Source' }));
    await user.click(screen.getByRole('option', { name }));
  }

  const ready = (
    overrides: Partial<React.ComponentProps<typeof MappingEditor>> = {},
  ): React.JSX.Element => (
    <MappingEditor
      initialDraft={createMappingDraft({ mangaTitle: 'Offline Work', chapters })}
      metadataProviders={[mangaDex]}
      onSearchMetadata={vi.fn(() => Promise.resolve([]))}
      onSuggestVolumes={vi.fn()}
      {...overrides}
    />
  );

  describe('where the chapters come from', () => {
    it('starts on the folder names, and says what they gave without going online', () => {
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
          startedFrom="mangabind"
        />,
      );

      expect(screen.getByRole('tab', { name: 'File names' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(
        screen.getByText('2 volumes were read from the names of 3 chapters, without going online.'),
      ).toBeVisible();
      // Nothing was changed yet, so there is nothing to start over from.
      expect(screen.getByRole('button', { name: 'Start over from the names' })).toBeDisabled();
    });

    it('says when the names gave nothing, and does not offer an online source with none to offer', () => {
      render(
        <MappingEditor initialDraft={createMappingDraft({ mangaTitle: 'Loose', chapters })} />,
      );

      expect(
        screen.getByText(
          'No volume could be read from the names of these folders. Use an online source, or group the chapters yourself.',
        ),
      ).toBeVisible();
      expect(screen.getByRole('tab', { name: 'Manual' })).toBeVisible();
      expect(screen.queryByRole('tab', { name: 'Online source' })).not.toBeInTheDocument();
    });

    it('goes back to what the names gave after edits, and says a single volume in the singular', async () => {
      const user = userEvent.setup();
      render(
        <MappingEditor
          initialDraft={createMappingDraft({
            mangaTitle: 'One Volume',
            chapters: chapters.slice(0, 1),
            volumes: [{ id: 'effective-volume-1', number: '1', chapterIds: ['chapter-1'] }],
          })}
          startedFrom="mangabind"
        />,
      );
      expect(
        screen.getByText('1 volume was read from the names of 1 chapter, without going online.'),
      ).toBeVisible();

      await user.click(screen.getByRole('button', { name: 'Add volume' }));
      expect(screen.getByText('Manual mapping · Offline')).toBeVisible();
      await user.click(screen.getByRole('button', { name: 'Start over from the names' }));

      expect(screen.getByText('Grouped by mangabind · Offline')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Start over from the names' })).toBeDisabled();
    });

    it('describes doing it by hand, and moves between the tabs with the keyboard', async () => {
      const user = userEvent.setup();
      render(ready());

      await user.click(screen.getByRole('tab', { name: 'Manual' }));
      expect(screen.getByText(/Add a volume with the plus button/u)).toBeVisible();
      expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Manual');

      screen.getByRole('tab', { name: 'File names' }).focus();
      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('tab', { name: 'Online source' })).toHaveFocus();
      expect(screen.getByRole('tab', { name: 'Online source' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await user.keyboard('{End}');
      expect(screen.getByRole('tab', { name: 'Manual' })).toHaveFocus();
      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('tab', { name: 'File names' })).toHaveFocus();
      await user.keyboard('{ArrowLeft}');
      expect(screen.getByRole('tab', { name: 'Manual' })).toHaveFocus();
      await user.keyboard('{Home}');
      expect(screen.getByRole('tab', { name: 'File names' })).toHaveFocus();
      // Only the selected tab is reachable with Tab.
      expect(screen.getByRole('tab', { name: 'Manual' })).toHaveAttribute('tabindex', '-1');
    });
  });

  describe('an online source', () => {
    it('is not chosen until a person chooses it: nothing is offered to search, and nothing is sent', async () => {
      const user = userEvent.setup();
      const onSearchMetadata = vi.fn(() => Promise.resolve([]));
      render(ready({ onSearchMetadata }));

      await user.click(screen.getByRole('tab', { name: 'Online source' }));

      expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent('Select a source');
      expect(
        screen.getByText(/Pick a source to look up which chapters belong in each volume/u),
      ).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument();
      expect(onSearchMetadata).not.toHaveBeenCalled();
    });

    it('is chosen from a list that names each source and where it lives, with none as the first entry', async () => {
      const user = userEvent.setup();
      render(ready({ metadataProviders: [mangaDex, otherSource] }));
      await user.click(screen.getByRole('tab', { name: 'Online source' }));

      await user.click(screen.getByRole('combobox', { name: 'Source' }));

      const options = within(screen.getByRole('listbox', { name: 'Source' })).getAllByRole(
        'option',
      );
      expect(options.map((option) => option.textContent)).toEqual([
        '–No online sourceOnly the folder names and your edits',
        'MMangaDexmangadex.org · Community catalogue of manga, with volume and chapter data',
        'OOther Sourceother.example · Another catalogue',
      ]);
      expect(options[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('credits the source, opens its site from the credit, and says where the title goes', async () => {
      const user = userEvent.setup();
      const onOpenProviderHomepage = vi.fn();
      render(ready({ onOpenProviderHomepage }));

      await chooseSource(user);

      expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent('MangaDex');
      expect(screen.getByText('Volume data by')).toBeVisible();
      await user.click(screen.getByRole('button', { name: 'Open MangaDex in your browser' }));
      expect(onOpenProviderHomepage).toHaveBeenCalledExactlyOnceWith('mangadex');
      expect(
        screen.getByText(
          'Searching sends the title to MangaDex. Only volume and chapter numbers are used, and nothing is downloaded from there.',
        ),
      ).toBeVisible();
    });

    it('shows the credit link without failing when the page was given no way to open it', async () => {
      const user = userEvent.setup();
      render(ready());

      await chooseSource(user);
      await user.click(screen.getByRole('button', { name: 'Open MangaDex in your browser' }));

      expect(screen.getByText('Volume data by')).toBeVisible();
    });

    it('applies a suggestion as an undoable edit without requiring it, and names the source that made it', async () => {
      const user = userEvent.setup();
      const onSearchMetadata = vi.fn(() =>
        Promise.resolve([{ id: 'work-1', title: 'A Quiet Journey', provider: 'mangadex' }]),
      );
      const onSuggestVolumes = vi.fn(() =>
        Promise.resolve({ volumes: [{ number: '1', chapterNumbers: [1, 2] }] }),
      );
      render(ready({ onSearchMetadata, onSuggestVolumes }));

      await chooseSource(user);
      await user.click(screen.getByRole('button', { name: 'Search' }));
      expect(await screen.findByText('A Quiet Journey')).toBeVisible();
      expect(onSearchMetadata).toHaveBeenCalledWith(
        'mangadex',
        'Offline Work',
        expect.any(AbortSignal),
      );
      await user.click(screen.getByRole('button', { name: 'Use these volumes' }));

      expect(await screen.findByText('Suggested by MangaDex')).toBeVisible();
      expect(onSuggestVolumes).toHaveBeenCalledWith('mangadex', 'work-1', undefined);
      const chapterOneRow = screen
        .getByRole('checkbox', { name: 'Select Chapter 1' })
        .closest('div');
      const chapterThreeRow = screen
        .getByRole('checkbox', { name: 'Select Chapter 3' })
        .closest('div');
      expect(within(chapterOneRow!).getByText('Volume 1')).toBeVisible();
      expect(within(chapterThreeRow!).getByText('Unassigned')).toBeVisible();

      await user.click(screen.getByRole('button', { name: 'Undo last mapping edit' }));
      expect(screen.getByText('Manual mapping · Offline')).toBeVisible();
      expect(within(chapterOneRow!).getByText('Unassigned')).toBeVisible();
    });

    it('looks the volumes up in the language the folders declare', async () => {
      const user = userEvent.setup();
      const onSuggestVolumes = vi.fn(() => Promise.resolve({ volumes: [] }));
      render(
        <MappingEditor
          initialDraft={createMappingDraft({
            mangaTitle: 'Chainsaw Man',
            chapters: chapters.map((chapter) => ({ ...chapter, language: 'pt-br' })),
          })}
          metadataProviders={[mangaDex]}
          onSearchMetadata={() =>
            Promise.resolve([{ id: 'work-1', title: 'Chainsaw Man', provider: 'mangadex' }])
          }
          onSuggestVolumes={onSuggestVolumes}
        />,
      );

      await chooseSource(user);
      expect(
        screen.getByText(/Volumes are looked up in pt-br, the language of your folders\./u),
      ).toBeVisible();
      await user.click(screen.getByRole('button', { name: 'Search' }));
      await user.click(await screen.findByRole('button', { name: 'Use these volumes' }));

      expect(onSuggestVolumes).toHaveBeenCalledWith('mangadex', 'work-1', 'pt-br');
    });

    it('is only searched when Search is used, never on choosing it or while typing', async () => {
      const user = userEvent.setup();
      const onSearchMetadata = vi.fn(() => Promise.resolve([]));
      render(ready({ onSearchMetadata }));

      await chooseSource(user);
      await user.type(screen.getByLabelText('Search MangaDex'), ' Extra');
      expect(onSearchMetadata).not.toHaveBeenCalled();
      expect(screen.queryByText('No matches found.')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Search' }));
      expect(onSearchMetadata).toHaveBeenCalledOnce();
      expect(await screen.findByText('No matches found.')).toBeVisible();
    });

    it('searches on Enter, and disables Search while the title is empty', async () => {
      const user = userEvent.setup();
      const onSearchMetadata = vi.fn(() => Promise.resolve([]));
      render(ready({ onSearchMetadata }));
      await chooseSource(user);
      const input = screen.getByLabelText('Search MangaDex');

      await user.clear(input);
      expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
      await user.keyboard('{Enter}');
      expect(onSearchMetadata).not.toHaveBeenCalled();

      await user.type(input, 'Another Title{Enter}');
      expect(onSearchMetadata).toHaveBeenCalledWith(
        'mangadex',
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
      const { unmount } = render(ready({ onSearchMetadata }));
      await chooseSource(user);

      await user.click(screen.getByRole('button', { name: 'Search' }));
      await user.click(screen.getByRole('button', { name: 'Search' }));

      expect(signals).toHaveLength(2);
      expect(signals[0]?.aborted).toBe(true);
      expect(signals[1]?.aborted).toBe(false);
      unmount();
      expect(signals[1]?.aborted).toBe(true);
    });

    it('clears what was found, and forgets a search under way, when another source or none is chosen', async () => {
      const user = userEvent.setup();
      const onSearchMetadata = vi.fn((providerId: string) =>
        Promise.resolve([{ id: 'work-1', title: `From ${providerId}`, provider: providerId }]),
      );
      render(ready({ metadataProviders: [mangaDex, otherSource], onSearchMetadata }));

      await chooseSource(user);
      await user.click(screen.getByRole('button', { name: 'Search' }));
      expect(await screen.findByText('From mangadex')).toBeVisible();

      await user.click(screen.getByRole('combobox', { name: 'Source' }));
      await user.click(screen.getByRole('option', { name: /Other Source/u }));
      expect(screen.queryByText('From mangadex')).not.toBeInTheDocument();
      expect(screen.getByText(/Searching sends the title to Other Source\./u)).toBeVisible();
      await user.click(screen.getByRole('button', { name: 'Search' }));
      expect(await screen.findByText('From other')).toBeVisible();

      // Back to no source: the results and the search are gone, and so is the credit.
      await user.click(screen.getByRole('combobox', { name: 'Source' }));
      await user.click(screen.getByRole('option', { name: /No online source/u }));
      expect(screen.queryByText('From other')).not.toBeInTheDocument();
      expect(screen.queryByText('Volume data by')).not.toBeInTheDocument();
    });

    it('keeps the choice with the caller when it keeps one across titles', async () => {
      const user = userEvent.setup();
      const onSelectProvider = vi.fn();
      const { rerender } = render(ready({ onSelectProvider, selectedProviderId: undefined }));
      await user.click(screen.getByRole('tab', { name: 'Online source' }));

      await user.click(screen.getByRole('combobox', { name: 'Source' }));
      await user.click(screen.getByRole('option', { name: /MangaDex/u }));
      expect(onSelectProvider).toHaveBeenCalledExactlyOnceWith('mangadex');
      // Nothing changes until the caller says so.
      expect(screen.queryByText('Volume data by')).not.toBeInTheDocument();

      rerender(ready({ onSelectProvider, selectedProviderId: 'mangadex' }));
      expect(screen.getByText('Volume data by')).toBeVisible();
    });

    it('keeps every manual control operable when the lookup fails', async () => {
      const user = userEvent.setup();
      render(
        ready({
          onSearchMetadata: () => Promise.reject(new Error('MangaDex is unreachable.')),
        }),
      );
      await chooseSource(user);

      await user.click(screen.getByRole('button', { name: 'Search' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('MangaDex is unreachable.');
      expect(screen.getByText('Manual mapping · Offline')).toBeVisible();

      await user.click(screen.getByRole('button', { name: 'Add volume' }));
      await user.click(screen.getByRole('button', { name: 'Select all' }));
      await user.click(screen.getByRole('button', { name: 'Assign selected' }));

      expect(screen.getByText('All chapters are ready to bind.')).toBeVisible();
    });

    it('shows a readable error when the search fails without saying why, and when applying fails', async () => {
      const user = userEvent.setup();
      const { unmount } = render(
        ready({
          // A rejection that is not an Error is what the fallback message is for.
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          onSearchMetadata: () => Promise.reject('offline'),
        }),
      );
      await chooseSource(user);
      await user.click(screen.getByRole('button', { name: 'Search' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The search could not be completed.',
      );
      unmount();

      render(
        ready({
          onSearchMetadata: () =>
            Promise.resolve([{ id: 'work-1', title: 'A Quiet Journey', provider: 'mangadex' }]),
          onSuggestVolumes: () => Promise.reject(new Error('The lookup timed out.')),
        }),
      );
      await chooseSource(user);
      await user.click(screen.getByRole('button', { name: 'Search' }));
      await user.click(await screen.findByRole('button', { name: 'Use these volumes' }));

      expect(await screen.findByText('The lookup timed out.')).toBeVisible();
      expect(screen.getByText('Manual mapping · Offline')).toBeVisible();
    });

    it('shows the plain reason when applying fails without saying why', async () => {
      const user = userEvent.setup();
      render(
        ready({
          onSearchMetadata: () =>
            Promise.resolve([{ id: 'work-1', title: 'A Quiet Journey', provider: 'mangadex' }]),
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          onSuggestVolumes: () => Promise.reject('offline'),
        }),
      );
      await chooseSource(user);
      await user.click(screen.getByRole('button', { name: 'Search' }));
      await user.click(await screen.findByRole('button', { name: 'Use these volumes' }));

      expect(await screen.findByText('The suggestion could not be applied.')).toBeVisible();
    });

    it('offers no online source without a source, without callbacks, or with neither', () => {
      const { rerender } = render(
        <MappingEditor
          initialDraft={createMappingDraft({ mangaTitle: 'Offline Work', chapters })}
        />,
      );
      expect(screen.queryByRole('tab', { name: 'Online source' })).not.toBeInTheDocument();

      // Callbacks with no source to send the title to: nothing to offer.
      rerender(
        <MappingEditor
          initialDraft={createMappingDraft({ mangaTitle: 'Offline Work', chapters })}
          metadataProviders={[]}
          onSearchMetadata={vi.fn()}
          onSuggestVolumes={vi.fn()}
        />,
      );
      expect(screen.queryByRole('tab', { name: 'Online source' })).not.toBeInTheDocument();

      // A source with no way to search it.
      rerender(
        <MappingEditor
          initialDraft={createMappingDraft({ mangaTitle: 'Offline Work', chapters })}
          metadataProviders={[mangaDex]}
        />,
      );
      expect(screen.queryByRole('tab', { name: 'Online source' })).not.toBeInTheDocument();
    });

    it('falls back to the folder names when the source goes away while its tab is open', async () => {
      const user = userEvent.setup();
      const { rerender } = render(ready());
      await user.click(screen.getByRole('tab', { name: 'Online source' }));

      rerender(
        <MappingEditor
          initialDraft={createMappingDraft({ mangaTitle: 'Offline Work', chapters })}
        />,
      );

      expect(screen.getByRole('tab', { name: 'File names' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
  });
});
