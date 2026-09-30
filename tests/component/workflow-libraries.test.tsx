import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultMangapressSettings } from '@/domain/output-profile';
import { App } from '@/renderer/app';
import { type MangaboundBridge } from '@/shared/runtime-info';

import {
  addFolder,
  expectNoOutputFolderPicker,
  folder,
  inspection,
  installBridge,
  runButton,
} from './support/workflow';
import {
  converted,
  goodTitle,
  groupedTitle,
  libraryBridge,
  libraryFolder,
  looseTitle,
} from './support/library';

afterEach(() => {
  Reflect.deleteProperty(window, 'mangabound');
});

describe('libraries in the queue', () => {
  it('is added like any folder, read as a library, and converted title by title', async () => {
    const user = userEvent.setup();
    const convertLibrary = vi.fn<MangaboundBridge['convertLibrary']>(() =>
      Promise.resolve({ ok: true, value: [converted('Good Manga', 'good-1')] }),
    );
    installBridge(libraryBridge([goodTitle, looseTitle], { convertLibrary }));
    render(<App />);

    await addFolder(user);
    const list = screen.getByRole('list', { name: 'Queued items' });
    expect(within(list).getByText('Manga Library')).toBeVisible();
    expect(within(list).getByText('1 title')).toBeVisible();
    expect(within(list).getByText('Library · 2 titles · 1 volume')).toBeVisible();
    expect(within(list).getByText('1 title left out until they have volumes.')).toBeVisible();

    expectNoOutputFolderPicker();
    await user.click(await runButton(1));

    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(convertLibrary.mock.calls[0]?.[0]).toMatchObject({
      sessionId: 'library-session',
      libraryId: 'pending-run',
      mode: 'bind-and-convert',
      settings: defaultMangapressSettings,
      format: 'epub',
      // Only the title that has volumes goes; the other waits.
      titles: ['Good Manga'],
    });
    expect(convertLibrary.mock.calls[0]?.[0]).not.toHaveProperty('parentPath');
    // What was left out is reported, with a way to fix it.
    expect(screen.getByText('Manga Library was skipped')).toBeVisible();
    expect(screen.getByText('1 title left out until they have volumes.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Convert more' }));
    // The library stays, with the title that was saved no longer counted.
    expect(screen.getByText('Needs volumes')).toBeVisible();
  });

  it('has the volumes of a title that has none set in the editor, and is read again', async () => {
    const user = userEvent.setup();
    const writeTitleMapping = vi.fn<MangaboundBridge['writeTitleMapping']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );
    const planLibrary = vi.fn<MangaboundBridge['planLibrary']>(() =>
      Promise.resolve({ ok: true, value: { titles: [goodTitle, groupedTitle], issues: [] } }),
    );
    const convertLibrary = vi.fn<MangaboundBridge['convertLibrary']>(() =>
      Promise.resolve({
        ok: true,
        value: [converted('Good Manga', 'good-1'), converted('Broken Manga', 'broken-1')],
      }),
    );
    installBridge(
      libraryBridge([goodTitle, looseTitle], { writeTitleMapping, planLibrary, convertLibrary }),
    );
    render(<App />);
    await addFolder(user);
    expectNoOutputFolderPicker();

    await user.click(screen.getByRole('button', { name: 'Edit titles of Manga Library' }));
    expect(await screen.findByRole('heading', { name: 'Manga Library' })).toBeVisible();
    const titles = screen.getByRole('list', { name: 'Titles' });
    expect(within(titles).getByText('1 volume')).toBeVisible();
    expect(within(titles).getByText('Needs volumes')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Edit volumes for Broken Manga' }));
    // Nothing grouped this title, so its volume is made by hand.
    await user.click(await screen.findByRole('button', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Add volume' }));
    await user.click(screen.getByRole('button', { name: 'Assign selected' }));
    await user.click(screen.getByRole('button', { name: 'Confirm mapping' }));

    // Saved by session and title name, then the library is read again.
    await waitFor(() => {
      expect(writeTitleMapping).toHaveBeenCalledWith(
        'library-session',
        'Broken Manga',
        expect.objectContaining({ mangaTitle: 'Broken Manga' }),
      );
    });
    expect(planLibrary).toHaveBeenCalledWith(expect.any(String), 'library-session');
    expect(await screen.findByRole('list', { name: 'Titles' })).toBeVisible();
    expect(
      within(screen.getByRole('list', { name: 'Titles' })).getAllByText('1 volume'),
    ).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Queue' }));
    expect(await screen.findByText('2 titles')).toBeVisible();
    await user.click(await runButton(1));
    expect(await screen.findByRole('heading', { name: '2 books ready' })).toBeVisible();
    expect(convertLibrary.mock.calls[0]?.[0].titles).toEqual(['Good Manga', 'Broken Manga']);
    // Everything in it was saved, so it leaves the queue.
    await user.click(screen.getByRole('button', { name: 'Convert more' }));
    expect(screen.queryByRole('list', { name: 'Queued items' })).not.toBeInTheDocument();
  });

  it('keeps a title that failed for another try, and runs only what was not saved', async () => {
    const user = userEvent.setup();
    const convertLibrary = vi
      .fn<MangaboundBridge['convertLibrary']>()
      .mockResolvedValueOnce({
        ok: true,
        value: [
          converted('Good Manga', 'good-1'),
          {
            title: 'Broken Manga',
            status: 'failed',
            artifacts: [],
            failure: { code: 'process_failed', message: 'mangapress crashed.' },
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true, value: [converted('Broken Manga', 'broken-1')] });
    installBridge(libraryBridge([goodTitle, groupedTitle], { convertLibrary }));
    render(<App />);
    await addFolder(user);
    expectNoOutputFolderPicker();

    await user.click(await runButton(1));

    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(screen.getByText('Manga Library · Broken Manga could not be converted')).toBeVisible();
    expect(screen.getByText('mangapress crashed.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Convert more' }));
    expect(screen.getByText('1 title failed last time and will run again.')).toBeVisible();
    await user.click(await runButton(1));

    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(convertLibrary.mock.calls[1]?.[0].titles).toEqual(['Broken Manga']);
    await user.click(screen.getByRole('button', { name: 'Convert more' }));
    expect(screen.queryByRole('list', { name: 'Queued items' })).not.toBeInTheDocument();
  });

  it('reports a library that could not be run at all', async () => {
    const user = userEvent.setup();
    installBridge(
      libraryBridge([goodTitle], {
        convertLibrary: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'not_a_library', message: 'This input is not a library.' },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    expectNoOutputFolderPicker();

    await user.click(await runButton(1));

    expect(await screen.findByRole('heading', { name: 'No books were produced' })).toBeVisible();
    expect(screen.getByText('Manga Library could not be converted')).toBeVisible();
    expect(screen.getByText('This input is not a library.')).toBeVisible();
  });

  it('stops the queue at a library that was cancelled', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({ ok: true, value: [] }),
    );
    installBridge(
      libraryBridge([goodTitle], {
        convert,
        chooseInputs: () =>
          Promise.resolve({
            ok: true,
            value: { inputs: [libraryFolder, folder('Second', 'second')], rejected: [] },
          }),
        inspectInput: (id) =>
          Promise.resolve(
            id === 'library-selection'
              ? {
                  ok: true,
                  value: {
                    sessionId: 'library-session',
                    displayName: 'Manga Library',
                    kind: 'library',
                    titles: [goodTitle],
                    issues: [],
                  },
                }
              : inspection(id),
          ),
        convertLibrary: () =>
          Promise.resolve({
            ok: true,
            value: [
              {
                title: 'Good Manga',
                status: 'failed',
                artifacts: [],
                failure: { code: 'cancelled', message: 'Cancelled.' },
              },
            ],
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    expectNoOutputFolderPicker();

    await user.click(await runButton(2));

    expect(await screen.findByRole('heading', { name: 'No books were produced' })).toBeVisible();
    expect(convert).not.toHaveBeenCalled();
  });

  it('is a queue of its own kind that cannot skip joining', async () => {
    const user = userEvent.setup();
    installBridge(libraryBridge([goodTitle]));
    render(<App />);

    await addFolder(user);

    // A library is joined title by title first, so the step is locked with the reason shown.
    expect(screen.getByRole('checkbox', { name: 'Group chapters into volumes' })).toBeDisabled();
    expect(
      screen.getByText(
        'A library is grouped title by title first, so it cannot skip joining volumes.',
      ),
    ).toBeVisible();
  });

  it('joins a library without converting, sending defaults for what mangapress would need', async () => {
    const user = userEvent.setup();
    const convertLibrary = vi.fn<MangaboundBridge['convertLibrary']>(() =>
      Promise.resolve({
        ok: true,
        value: [
          {
            title: 'Good Manga',
            status: 'done',
            artifacts: [{ id: 'a', name: 'Good Manga - Vol.01.cbz', bytes: 10, format: 'cbz' }],
          },
        ],
      }),
    );
    installBridge(libraryBridge([goodTitle], { convertLibrary }));
    render(<App />);
    await addFolder(user);
    await user.click(screen.getByRole('radio', { name: 'PDF' }));

    await user.click(screen.getByRole('checkbox', { name: 'Convert for e-reader' }));
    expectNoOutputFolderPicker();
    await user.click(await runButton(1));

    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(convertLibrary.mock.calls[0]?.[0]).toMatchObject({
      mode: 'bind-only',
      settings: defaultMangapressSettings,
      format: 'cbz',
    });
  });

  it('is left out, with the reason, next to a folder when the run does not group', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'a1', name: 'Offline Work.epub', bytes: 2048, format: 'epub' }],
      }),
    );
    const convertLibrary = vi.fn<MangaboundBridge['convertLibrary']>(() =>
      Promise.resolve({ ok: true, value: [] }),
    );
    installBridge(
      libraryBridge([goodTitle], {
        convert,
        convertLibrary,
        chooseInputs: () =>
          Promise.resolve({
            ok: true,
            value: { inputs: [libraryFolder, folder('Offline Work', 'plain')], rejected: [] },
          }),
        inspectInput: (id) =>
          Promise.resolve(
            id === 'library-selection'
              ? {
                  ok: true,
                  value: {
                    sessionId: 'library-session',
                    displayName: 'Manga Library',
                    kind: 'library',
                    titles: [goodTitle],
                    issues: [],
                  },
                }
              : inspection(id),
          ),
      }),
    );
    render(<App />);
    await addFolder(user);
    expectNoOutputFolderPicker();

    await user.click(screen.getByRole('checkbox', { name: 'Group chapters into volumes' }));
    expect(screen.getByText('Needs grouping')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Edit titles of Manga Library' }),
    ).not.toBeInTheDocument();
    await user.click(await runButton(1));

    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(convertLibrary).not.toHaveBeenCalled();
    expect(screen.getByText('Manga Library was skipped')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Fix Manga Library' })).not.toBeInTheDocument();
  });

  it('shows what a library would make by reading it again, without writing anything', async () => {
    const user = userEvent.setup();
    const planLibrary = vi.fn<MangaboundBridge['planLibrary']>(() =>
      Promise.resolve({ ok: true, value: { titles: [goodTitle, looseTitle], issues: [] } }),
    );
    installBridge(libraryBridge([goodTitle, looseTitle], { planLibrary }));
    render(<App />);
    await addFolder(user);
    expectNoOutputFolderPicker();

    await user.click(screen.getByRole('button', { name: 'Validate plan' }));

    expect(await screen.findByRole('heading', { name: 'Plan validated' })).toBeVisible();
    expect(planLibrary).toHaveBeenCalledWith(expect.any(String), 'library-session');
    expect(
      screen.getByText('mangabind validated 1 title · 1 volume · no library files written'),
    ).toBeVisible();
    expect(screen.getByText('Good Manga - Vol.01.cbz')).toBeVisible();
    expect(screen.queryByText('Broken Manga - Vol.01.cbz')).not.toBeInTheDocument();
  });

  it('plans one EPUB per ready library title in single-book mode', async () => {
    const user = userEvent.setup();
    installBridge(
      libraryBridge([goodTitle, looseTitle], {
        planLibrary: () =>
          Promise.resolve({ ok: true, value: { titles: [goodTitle, looseTitle], issues: [] } }),
      }),
    );
    render(<App />);
    await addFolder(user);
    expectNoOutputFolderPicker();
    await user.click(screen.getByRole('checkbox', { name: 'Create one book for the series' }));
    await user.click(screen.getByRole('button', { name: 'Validate plan' }));

    expect(await screen.findByRole('heading', { name: 'Plan validated' })).toBeVisible();
    expect(
      screen.getByText(
        'mangabind validated 1 title · 1 volume · 1 EPUB (one per series) · no library files written',
      ),
    ).toBeVisible();
    expect(screen.getByText('One EPUB for Good Manga')).toBeVisible();
    expect(screen.queryByText('Good Manga - Vol.01.cbz')).not.toBeInTheDocument();
  });

  it('says when the plan of a library could not be read', async () => {
    const user = userEvent.setup();
    installBridge(
      libraryBridge([goodTitle], {
        planLibrary: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'process_failed', message: 'mangabind could not read this library.' },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    expectNoOutputFolderPicker();

    await user.click(screen.getByRole('button', { name: 'Validate plan' }));

    expect(await screen.findByRole('alert', { name: 'Workflow error' })).toHaveTextContent(
      'mangabind could not read this library.',
    );
  });

  it('stays in the title editor and says why when the mapping could not be saved', async () => {
    const user = userEvent.setup();
    const planLibrary = vi.fn<MangaboundBridge['planLibrary']>(() =>
      Promise.resolve({ ok: true, value: { titles: [goodTitle], issues: [] } }),
    );
    installBridge(
      libraryBridge([goodTitle], {
        planLibrary,
        writeTitleMapping: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'mapping_save_failed', message: 'The folder is read-only.' },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);

    await user.click(screen.getByRole('button', { name: 'Edit titles of Manga Library' }));
    await user.click(await screen.findByRole('button', { name: 'Edit volumes for Good Manga' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm mapping' }));

    expect(await screen.findByRole('alert', { name: 'Workflow error' })).toHaveTextContent(
      'The folder is read-only.',
    );
    expect(planLibrary).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirm mapping' })).toBeVisible();
  });

  it('stays in the title editor and says why when the library could not be read again', async () => {
    const user = userEvent.setup();
    installBridge(
      libraryBridge([goodTitle], {
        planLibrary: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'process_failed', message: 'mangabind could not read this library.' },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);

    await user.click(screen.getByRole('button', { name: 'Edit titles of Manga Library' }));
    await user.click(await screen.findByRole('button', { name: 'Edit volumes for Good Manga' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm mapping' }));

    expect(await screen.findByRole('alert', { name: 'Workflow error' })).toHaveTextContent(
      'mangabind could not read this library.',
    );
    expect(screen.getByRole('button', { name: 'Confirm mapping' })).toBeVisible();
  });

  it('goes back to the queue, and from the title editor to the library', async () => {
    const user = userEvent.setup();
    installBridge(libraryBridge([goodTitle]));
    render(<App />);
    await addFolder(user);

    await user.click(screen.getByRole('button', { name: 'Edit titles of Manga Library' }));
    await user.click(await screen.findByRole('button', { name: 'Edit volumes for Good Manga' }));
    await user.click(await screen.findByRole('button', { name: /Manga Library/u }));
    expect(await screen.findByRole('list', { name: 'Titles' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Queue' }));

    expect(await screen.findByRole('heading', { name: 'Queue' })).toBeVisible();
  });

  it('offers to fix a library that was left out, opening its titles', async () => {
    const user = userEvent.setup();
    installBridge(
      libraryBridge([goodTitle, looseTitle], {
        convertLibrary: () =>
          Promise.resolve({ ok: true, value: [converted('Good Manga', 'good-1')] }),
      }),
    );
    render(<App />);
    await addFolder(user);
    expectNoOutputFolderPicker();
    await user.click(await runButton(1));
    await screen.findByText('Manga Library was skipped');

    await user.click(screen.getByRole('button', { name: 'Fix Manga Library' }));

    expect(await screen.findByRole('list', { name: 'Titles' })).toBeVisible();
  });
});
