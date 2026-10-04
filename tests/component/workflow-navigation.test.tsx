import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/renderer/app';
import type { MangaboundBridge } from '@/shared/runtime-info';

import { converted, goodTitle, groupedTitle, looseTitle } from './support/library';
import {
  addFolder,
  bridge,
  cbz,
  folder,
  inspection,
  installBridge,
  partialMapping,
  runButton,
} from './support/workflow';

afterEach(() => {
  Reflect.deleteProperty(window, 'mangabound');
});

/** Two libraries deliberately have the same title names, but different sessions and details. */
function mixedQueue(overrides: Partial<MangaboundBridge> = {}): MangaboundBridge {
  const libraries = [folder('First Library', 'first'), folder('Second Library', 'second')];
  return bridge({
    chooseInputs: () =>
      Promise.resolve({
        ok: true,
        value: { inputs: [...libraries, folder(), cbz], rejected: [] },
      }),
    inspectInput: (id) => {
      const library = libraries.find((candidate) => candidate.selectionId === id);
      return Promise.resolve(
        library === undefined
          ? inspection(id)
          : {
              ok: true,
              value: {
                sessionId: `session-${id}`,
                displayName: library.displayName,
                kind: 'library',
                titles: [
                  { ...goodTitle, details: { author: `${library.displayName} Author` } },
                  looseTitle,
                ],
                issues: [],
              },
            },
      );
    },
    ...overrides,
  });
}

describe('workflow navigation targets', () => {
  it('keeps details attached to their library or input across mapping and options visits', async () => {
    const user = userEvent.setup();
    const saveBookDetails = vi.fn<MangaboundBridge['saveBookDetails']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );
    installBridge(mixedQueue({ saveBookDetails }));
    render(<App />);
    await addFolder(user);

    await user.click(screen.getByRole('button', { name: 'Edit titles of First Library' }));
    await user.click(await screen.findByRole('button', { name: 'Edit details of Good Manga' }));
    expect(await screen.findByLabelText('Author')).toHaveValue('First Library Author');
    await user.clear(screen.getByLabelText('Author'));
    await user.type(screen.getByLabelText('Author'), 'Changed Author');
    await user.click(screen.getByRole('button', { name: 'First Library' }));
    expect(await screen.findByRole('heading', { name: 'First Library' })).toBeVisible();
    expect(saveBookDetails).toHaveBeenLastCalledWith({
      sessionId: 'session-first',
      title: 'Good Manga',
      details: { author: 'Changed Author' },
    });
    await user.click(screen.getByRole('button', { name: 'Queue' }));

    await user.click(screen.getByRole('button', { name: 'Edit titles of Second Library' }));
    await user.click(await screen.findByRole('button', { name: 'Edit details of Good Manga' }));
    expect(await screen.findByLabelText('Author')).toHaveValue('Second Library Author');
    await user.type(screen.getByLabelText('Language'), 'ja');
    await user.click(screen.getByRole('button', { name: 'Second Library' }));
    expect(saveBookDetails).toHaveBeenLastCalledWith({
      sessionId: 'session-second',
      title: 'Good Manga',
      details: { author: 'Second Library Author', language: 'ja' },
    });
    await user.click(await screen.findByRole('button', { name: 'Edit volumes for Broken Manga' }));
    expect(await screen.findByRole('heading', { name: /Organize Broken Manga/u })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Second Library' }));
    expect(await screen.findByRole('heading', { name: 'Second Library' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Queue' }));

    await user.click(screen.getByRole('button', { name: 'Advanced conversion options' }));
    expect(await screen.findByRole('heading', { name: 'Conversion options' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Edit details of Offline Work' }));
    expect(await screen.findByLabelText('Author')).toHaveValue('');
    await user.type(screen.getByLabelText('Author'), 'Folder Author');
    await user.click(screen.getByRole('button', { name: 'Queue' }));
    expect(saveBookDetails).toHaveBeenLastCalledWith({
      sessionId: 'session',
      details: { author: 'Folder Author' },
    });

    await user.click(screen.getByRole('button', { name: 'Edit details of Standalone.cbz' }));
    expect(await screen.findByLabelText('Book title')).toHaveAttribute('placeholder', 'Standalone');
    expect(screen.getByLabelText('Author')).toHaveValue('');
    await user.type(screen.getByLabelText('Author'), 'CBZ Author');
    await user.click(screen.getByRole('button', { name: 'Queue' }));
    expect(saveBookDetails).toHaveBeenCalledTimes(3);

    await user.click(screen.getByRole('button', { name: 'Edit titles of First Library' }));
    await user.click(await screen.findByRole('button', { name: 'Edit details of Good Manga' }));
    expect(await screen.findByLabelText('Author')).toHaveValue('Changed Author');
    expect(screen.getByLabelText('Language')).toHaveValue('');
  }, 20_000); // A long walk through five screens: close to the default five seconds on a busy machine.

  it('retries a title mapping in the selected library and refreshes only that library', async () => {
    const user = userEvent.setup();
    const writeTitleMapping = vi
      .fn<MangaboundBridge['writeTitleMapping']>()
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'mapping_save_failed', message: 'The folder is read-only.' },
      })
      .mockResolvedValueOnce({ ok: true, value: undefined });
    const planLibrary = vi.fn<MangaboundBridge['planLibrary']>(() =>
      Promise.resolve({ ok: true, value: { titles: [goodTitle, groupedTitle], issues: [] } }),
    );
    installBridge(mixedQueue({ writeTitleMapping, planLibrary }));
    render(<App />);
    await addFolder(user);

    await user.click(screen.getByRole('button', { name: 'Edit titles of First Library' }));
    await user.click(await screen.findByRole('button', { name: 'Edit volumes for Good Manga' }));
    await user.click(await screen.findByRole('button', { name: 'First Library' }));
    await user.click(screen.getByRole('button', { name: 'Queue' }));
    await user.click(screen.getByRole('button', { name: 'Edit titles of Second Library' }));
    await user.click(await screen.findByRole('button', { name: 'Edit volumes for Broken Manga' }));
    await user.click(await screen.findByRole('button', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Add volume' }));
    await user.click(screen.getByRole('button', { name: 'Assign selected' }));
    await user.click(screen.getByRole('button', { name: 'Confirm mapping' }));

    expect(await screen.findByRole('alert', { name: 'Workflow error' })).toHaveTextContent(
      'The folder is read-only.',
    );
    expect(screen.getByRole('heading', { name: /Organize Broken Manga/u })).toBeVisible();
    expect(planLibrary).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm mapping' }));

    expect(await screen.findByRole('heading', { name: 'Second Library' })).toBeVisible();
    expect(
      within(screen.getByRole('list', { name: 'Titles' })).getAllByText('1 volume'),
    ).toHaveLength(2);
    await waitFor(() => {
      expect(writeTitleMapping).toHaveBeenNthCalledWith(
        2,
        'session-second',
        'Broken Manga',
        expect.objectContaining({ mangaTitle: 'Broken Manga' }),
      );
    });
    expect(planLibrary).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'session-second');
    await user.click(screen.getByRole('button', { name: 'Queue' }));
    await user.click(screen.getByRole('button', { name: 'Edit titles of First Library' }));
    expect(await screen.findByText('Needs volumes')).toBeVisible();
  });

  it.each(['First Library', 'Offline Work'])(
    'opens %s for fixing from results after a different library title was visited',
    async (name) => {
      const user = userEvent.setup();
      const base = mixedQueue();
      installBridge(
        mixedQueue({
          inspectInput: async (id) => {
            const inspected = await base.inspectInput(id);
            return id === 'selection' && inspected.ok
              ? { ok: true, value: { ...inspected.value, mapping: partialMapping } }
              : inspected;
          },
          convertLibrary: () =>
            Promise.resolve({ ok: true, value: [converted('Good Manga', 'good-book')] }),
        }),
      );
      render(<App />);
      await addFolder(user);
      await user.click(screen.getByRole('button', { name: 'Edit titles of Second Library' }));
      await user.click(await screen.findByRole('button', { name: 'Edit details of Good Manga' }));
      await user.click(await screen.findByRole('button', { name: 'Second Library' }));
      await user.click(screen.getByRole('button', { name: 'Queue' }));
      await user.click(await runButton(3));
      await user.click(await screen.findByRole('button', { name: `Fix ${name}` }));
      if (name === 'First Library') {
        expect(await screen.findByRole('heading', { name })).toBeVisible();
        expect(screen.getByRole('list', { name: 'Titles' })).toBeVisible();
      } else {
        expect(
          await screen.findByRole('heading', { name: /Organize Offline Work/u }),
        ).toBeVisible();
        expect(screen.queryByRole('list', { name: 'Titles' })).not.toBeInTheDocument();
      }
      await user.click(screen.getByRole('button', { name: 'Queue' }));
      expect(await screen.findByRole('heading', { name: 'Queue' })).toBeVisible();
    },
  );
});
