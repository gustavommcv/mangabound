import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMappingDraft } from '@/domain/mapping';
import { defaultMangapressSettings } from '@/domain/output-profile';
import { defaultPreferences } from '@/domain/preferences';
import { App } from '@/renderer/app';
import { type MangaboundBridge } from '@/shared/runtime-info';

import {
  addFolder,
  bridge,
  cbz,
  chapters,
  deferred,
  expectNoOutputFolderPicker,
  folder,
  installBridge,
  keptSettings,
  mapping,
  runButton,
} from './support/workflow';

afterEach(() => {
  Reflect.deleteProperty(window, 'mangabound');
});

describe('process control in the queue', () => {
  it('joins the volumes only: mangapress is not run, its controls lock, and only defaults are sent', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'a1', name: 'Offline Work - Vol.01.cbz', bytes: 4096, format: 'cbz' }],
      }),
    );
    installBridge(bridge({ convert }));
    render(<App />);
    await addFolder(user);
    await user.click(screen.getByRole('radio', { name: 'PDF' }));

    await user.click(screen.getByRole('checkbox', { name: 'Convert for e-reader' }));

    expect(screen.getByLabelText('Device')).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'PDF' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /Advanced conversion options/u }),
    ).not.toBeInTheDocument();
    expectNoOutputFolderPicker();
    await user.click(await runButton(1));

    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(screen.getByText('Joined volumes · CBZ')).toBeVisible();
    // The PDF choice was for mangapress, which did not run.
    expect(convert.mock.calls[0]?.[0]).toMatchObject({
      sessionId: 'session',
      libraryId: 'pending-run',
      mode: 'bind-only',
      settings: defaultMangapressSettings,
      format: 'cbz',
      mapping,
    });
  });

  it('sends a folder straight to mangapress as one book, without its volumes', async () => {
    const user = userEvent.setup();
    const planConversion = vi.fn<MangaboundBridge['planConversion']>(() =>
      Promise.resolve({
        ok: true,
        value: {
          tool: 'mangapress',
          title: 'Offline Work',
          message: 'mangapress validated KV',
          books: [{ name: 'Offline Work.epub', pageCount: 4 }],
          issues: [],
        },
      }),
    );
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'a1', name: 'Offline Work.epub', bytes: 2048, format: 'epub' }],
      }),
    );
    installBridge(bridge({ convert, planConversion }));
    render(<App />);
    await addFolder(user);

    await user.click(screen.getByRole('checkbox', { name: 'Group chapters into volumes' }));

    expect(screen.getByText('One book')).toBeVisible();
    expect(screen.getByText(/2 chapters · not grouped/u)).toBeVisible();
    // No volumes are in play, so there is nothing to edit.
    expect(
      screen.queryByRole('button', { name: 'Edit volumes for Offline Work' }),
    ).not.toBeInTheDocument();

    expectNoOutputFolderPicker();
    await user.click(screen.getByRole('button', { name: 'Validate plan' }));
    expect(await screen.findByRole('heading', { name: 'Plan validated' })).toBeVisible();
    expect(planConversion.mock.calls[0]?.[0]).toMatchObject({ mode: 'convert-only' });
    expect(planConversion.mock.calls[0]?.[0].mapping).toBeUndefined();

    await user.click(await runButton(1));
    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(convert.mock.calls[0]?.[0]).toMatchObject({
      mode: 'convert-only',
      settings: defaultMangapressSettings,
      format: 'epub',
    });
    expect(convert.mock.calls[0]?.[0].mapping).toBeUndefined();
  });

  it('skips grouping from the editor, which sends the queue straight to mangapress', async () => {
    const user = userEvent.setup();
    installBridge(bridge());
    render(<App />);
    await addFolder(user);

    await user.click(screen.getByRole('button', { name: 'Edit volumes for Offline Work' }));
    await user.click(await screen.findByRole('button', { name: 'Skip grouping' }));

    expect(await screen.findByRole('heading', { name: 'Queue' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Group chapters into volumes' })).not.toBeChecked();
    expect(screen.getByText('One book')).toBeVisible();
  });

  it('leaves a CBZ out of a join-only run and says so, with nothing to fix', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'a1', name: 'Offline Work - Vol.01.cbz', bytes: 4096, format: 'cbz' }],
      }),
    );
    installBridge(
      bridge({
        convert,
        chooseInputs: () =>
          Promise.resolve({ ok: true, value: { inputs: [folder(), cbz], rejected: [] } }),
      }),
    );
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Folder' }));
    await waitFor(() => {
      expect(screen.queryByText('Checking…')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('checkbox', { name: 'Convert for e-reader' }));
    expect(screen.getByText('Nothing to join')).toBeVisible();
    expectNoOutputFolderPicker();
    expect(
      screen.getByText('1 item will be left out. Use the pencil on a row to fix it.'),
    ).toBeVisible();
    await user.click(await runButton(1));

    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(convert).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Standalone.cbz was skipped')).toBeVisible();
    expect(
      screen.getByText('A CBZ is already one volume, so there is nothing to join.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Fix Standalone.cbz' })).not.toBeInTheDocument();
    // The CBZ stays in the queue: it was not processed.
    await user.click(screen.getByRole('button', { name: 'Convert more' }));
    expect(screen.getByText('Standalone.cbz')).toBeVisible();
    expect(screen.queryByText('Offline Work')).not.toBeInTheDocument();
  });

  it('runs the queue one item at a time and keeps the ones that failed for another try', async () => {
    const user = userEvent.setup();
    const convert = vi
      .fn<MangaboundBridge['convert']>()
      .mockResolvedValueOnce({
        ok: true,
        value: [{ id: 'a1', name: 'First.epub', bytes: 2048, format: 'epub' }],
      })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'process_failed', message: 'mangapress crashed.' },
      });
    installBridge(
      bridge({
        convert,
        chooseInputs: () =>
          Promise.resolve({
            ok: true,
            value: {
              inputs: [folder('First', 'first'), folder('Second', 'second')],
              rejected: [],
            },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    expectNoOutputFolderPicker();

    await user.click(await runButton(2));

    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(convert.mock.calls.map(([command]) => command.sessionId)).toEqual([
      'session-first',
      'session-second',
    ]);
    expect(screen.getByText('Second could not be converted')).toBeVisible();
    expect(screen.getByText('mangapress crashed.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Convert more' }));
    const list = screen.getByRole('list', { name: 'Queued items' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText('Second')).toBeVisible();
  });

  it('stops the queue at the item that was cancelled', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({
        ok: false,
        error: { code: 'cancelled', message: 'The conversion was cancelled.' },
      }),
    );
    installBridge(
      bridge({
        convert,
        chooseInputs: () =>
          Promise.resolve({
            ok: true,
            value: {
              inputs: [folder('First', 'first'), folder('Second', 'second')],
              rejected: [],
            },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    expectNoOutputFolderPicker();

    await user.click(await runButton(2));

    expect(await screen.findByRole('heading', { name: 'No books were produced' })).toBeVisible();
    expect(convert).toHaveBeenCalledOnce();
    expect(screen.getByText('First could not be converted')).toBeVisible();
  });

  it('keeps a user cancellation requested while the active input finishes successfully', async () => {
    const user = userEvent.setup();
    const completion = deferred<Awaited<ReturnType<MangaboundBridge['convert']>>>();
    const convert = vi.fn<MangaboundBridge['convert']>(() => completion.promise);
    const releaseInput = vi.fn<MangaboundBridge['releaseInput']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );
    installBridge(
      bridge({
        convert,
        releaseInput,
        chooseInputs: () =>
          Promise.resolve({
            ok: true,
            value: { inputs: [folder('First', 'first'), folder('Second', 'second')], rejected: [] },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await user.click(await runButton(2));
    await user.click(await screen.findByRole('button', { name: 'Cancel conversion' }));
    await act(async () => {
      completion.resolve({
        ok: true,
        value: [{ id: 'first-book', name: 'First.epub', bytes: 2048, format: 'epub' }],
      });
      await completion.promise;
    });

    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(convert).toHaveBeenCalledOnce();
    expect(screen.queryByText('Second was skipped')).not.toBeInTheDocument();
    expect(releaseInput).toHaveBeenCalledExactlyOnceWith('session-first');
    await user.click(screen.getByRole('button', { name: 'Convert more' }));
    const queue = screen.getByRole('list', { name: 'Queued items' });
    expect(within(queue).getByText('Second')).toBeVisible();
    expect(within(queue).queryByText('First')).not.toBeInTheDocument();
  });

  it('offers to fix a folder that was left out, and opens its volumes', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        chooseInputs: () =>
          Promise.resolve({
            ok: true,
            value: {
              inputs: [folder('Good', 'good'), folder('Loose', 'loose')],
              rejected: [],
            },
          }),
        inspectInput: (id) =>
          Promise.resolve({
            ok: true,
            value: {
              sessionId: `session-${id}`,
              displayName: id,
              kind: 'folder',
              mapping:
                id === 'loose' ? createMappingDraft({ mangaTitle: 'Loose', chapters }) : mapping,
              issues: [],
            },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    expectNoOutputFolderPicker();
    expect(
      screen.getByText('1 item will be left out. Use the pencil on a row to fix it.'),
    ).toBeVisible();

    await user.click(await runButton(1));

    expect(await screen.findByText('Loose was skipped')).toBeVisible();
    expect(
      screen.getByText('No volumes yet. Open Edit volumes to group the chapters.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Fix Loose' }));
    expect(await screen.findByRole('button', { name: 'Confirm mapping' })).toBeVisible();
  });

  it('keeps a queue of only CBZ files on its one process', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        chooseInputs: () => Promise.resolve({ ok: true, value: { inputs: [cbz], rejected: [] } }),
      }),
    );
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Files' }));
    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeVisible();
    });

    // Neither step can change: one is meaningless for a CBZ and the other is the only one left.
    expect(screen.getByRole('checkbox', { name: 'Group chapters into volumes' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Convert for e-reader' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Convert for e-reader' })).toBeChecked();
    expect(screen.getByText('Keep at least one step on.')).toBeVisible();
  });

  it('locks steps and format when "Create one book for the series" is checked, and unlocks them when unchecked', async () => {
    const user = userEvent.setup();
    installBridge(bridge());
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Queue' })).toBeVisible();
    const singleBookCheckbox = screen.getByRole('checkbox', {
      name: 'Create one book for the series',
    });
    expect(singleBookCheckbox).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Group chapters into volumes' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Convert for e-reader' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'EPUB' })).toBeEnabled();

    await user.click(singleBookCheckbox);

    expect(singleBookCheckbox).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Group chapters into volumes' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Group chapters into volumes' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Convert for e-reader' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Convert for e-reader' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'EPUB' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'EPUB' })).toBeChecked();
    expect(
      screen.getAllByText('Turn off “Create one book for the series” to change this.'),
    ).toHaveLength(3);

    // Individual restore for "Create one book for the series"
    await user.click(
      screen.getByRole('button', { name: 'Restore default for Create one book for the series' }),
    );

    expect(singleBookCheckbox).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Group chapters into volumes' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Convert for e-reader' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'EPUB' })).toBeEnabled();
    expect(
      screen.queryByText('Turn off “Create one book for the series” to change this.'),
    ).not.toBeInTheDocument();
  });

  it('disables "Create one book for the series" when only CBZ files are in the queue', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        chooseInputs: () => Promise.resolve({ ok: true, value: { inputs: [cbz], rejected: [] } }),
      }),
    );
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Files' }));
    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeVisible();
    });

    const singleBookCheckbox = screen.getByRole('checkbox', {
      name: 'Create one book for the series',
    });
    expect(singleBookCheckbox).toBeDisabled();
    expect(screen.getByText('Not available for standalone .cbz files.')).toBeVisible();
  });

  it('keeps the saved mode available but does not lock a CBZ-only queue', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        chooseInputs: () => Promise.resolve({ ok: true, value: { inputs: [cbz], rejected: [] } }),
        loadSettings: keptSettings({
          preferences: { ...defaultPreferences, singleBook: true },
        }),
      }),
    );
    render(<App />);

    const singleBookCheckbox = await screen.findByRole('checkbox', {
      name: 'Create one book for the series',
    });
    await waitFor(() => expect(singleBookCheckbox).toBeChecked());
    await user.click(screen.getByRole('button', { name: 'Files' }));
    await waitFor(() => expect(screen.getByText('Ready')).toBeVisible());

    expect(singleBookCheckbox).toBeEnabled();
    expect(
      screen.getByText('Saved for manga folders. A standalone CBZ is already one book.'),
    ).toBeVisible();
    expect(screen.getByRole('radio', { name: 'PDF' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Advanced conversion options' }));
    expect(
      screen.queryByRole('status', { name: 'Single book for the series' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));

    await user.click(screen.getByRole('radio', { name: 'PDF' }));
    expect(
      screen.getByRole('checkbox', { name: 'Create one book for the series' }),
    ).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'PDF' })).toBeChecked();
  });

  it('enables "Create one book for the series" when both folders and CBZ files are in the queue', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        chooseInputs: () =>
          Promise.resolve({
            ok: true,
            value: { inputs: [folder(), cbz], rejected: [] },
          }),
      }),
    );
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Files' }));
    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeVisible();
    });

    const singleBookCheckbox = screen.getByRole('checkbox', {
      name: 'Create one book for the series',
    });
    expect(singleBookCheckbox).toBeEnabled();
    expect(
      screen.getByText(
        'Produces a single EPUB with volumes and chapters in the table of contents.',
      ),
    ).toBeVisible();
  });
});
