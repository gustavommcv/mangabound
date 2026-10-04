import { describe, expect, it, vi } from 'vitest';

import type { PreferencesWorkflow, RestoredPreferences } from '@/application/workflows/preferences';
import type { InputSelection } from '@/domain/conversion';
import { defaultPreferences, type Preferences } from '@/domain/preferences';
import { PendingSaveError } from '@/library/pending-save';
import { withSavedBook } from '@/main/ipc/artifact-access';
import {
  discardRefusal,
  type PendingReference,
  runOfSelection,
  wrongExtension,
} from '@/main/ipc/pending-decisions';
import { remember, saveChosen } from '@/main/ipc/preferences-state';
import { rememberPickerFolder, rememberSaveFolder } from '@/main/ipc/remembered-folders';
import { inspectOnce } from '@/main/ipc/selections';
import { cleanUpBeforeQuit, type QuitCleanup } from '@/main/quit-cleanup';

const nothingRemembered = {
  currentPreferences: defaultPreferences,
  lastPickerFolder: undefined,
  lastSaveFolder: undefined,
  preferences: undefined,
  preferredNetworkInterface: undefined,
};

describe('remembering the folder a dialog was last in', () => {
  const chosen: Preferences = { ...defaultPreferences, format: 'pdf' };
  const network = { name: 'Ethernet', address: '192.168.18.39' };

  function remembering(save: PreferencesWorkflow['save']) {
    return {
      ...nothingRemembered,
      currentPreferences: chosen,
      lastPickerFolder: '/pickers',
      lastSaveFolder: '/saves',
      preferredNetworkInterface: network,
      preferences: { save } as unknown as PreferencesWorkflow,
    };
  }

  it('keeps the Save folder in memory and writes it down with everything else as it stands', () => {
    const save = vi.fn<PreferencesWorkflow['save']>(() => Promise.resolve());
    const context = remembering(save);

    rememberSaveFolder(context, '/new/saves');

    expect(context.lastSaveFolder).toBe('/new/saves');
    expect(save).toHaveBeenCalledExactlyOnceWith(chosen, '/new/saves', '/pickers', network);
  });

  it('keeps the picker folder in memory and writes it down with everything else as it stands', () => {
    const save = vi.fn<PreferencesWorkflow['save']>(() => Promise.resolve());
    const context = remembering(save);

    rememberPickerFolder(context, '/new/pickers');

    expect(context.lastPickerFolder).toBe('/new/pickers');
    expect(save).toHaveBeenCalledExactlyOnceWith(chosen, '/saves', '/new/pickers', network);
  });

  it('still remembers in memory when there is nothing to write it with yet', () => {
    const context = { ...nothingRemembered };

    rememberSaveFolder(context, '/a');
    rememberPickerFolder(context, '/b');

    expect(context.lastSaveFolder).toBe('/a');
    expect(context.lastPickerFolder).toBe('/b');
  });

  it('says so when it cannot be written, and does not stop what the person was doing', async () => {
    const failure = new Error('disk full');
    const context = remembering(() => Promise.reject(failure));
    const report = vi.fn();

    rememberSaveFolder(context, '/a', report);
    rememberPickerFolder(context, '/b', report);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledWith(
      'Could not remember the last Save dialog location.',
      failure,
    );
    expect(report).toHaveBeenCalledWith(
      'Could not remember the last input dialog location.',
      failure,
    );
  });

  it('reports to the log when it is not told where else', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('read only');
    try {
      rememberSaveFolder(
        remembering(() => Promise.reject(failure)),
        '/a',
      );
      rememberPickerFolder(
        remembering(() => Promise.reject(failure)),
        '/b',
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(error).toHaveBeenCalledTimes(2);
      expect(error).toHaveBeenCalledWith(
        'Could not remember the last Save dialog location.',
        failure,
      );
    } finally {
      error.mockRestore();
    }
  });
});

describe('which books Save All may take', () => {
  const references = new Map<string, PendingReference>([
    ['a1', { runId: 'run-a', relativePath: 'One.epub' }],
    ['a2', { runId: 'run-a', relativePath: 'Two.epub' }],
    ['b1', { runId: 'run-b', relativePath: 'Three.epub' }],
  ]);

  it('is the run all the books belong to', () => {
    expect(runOfSelection(['a1'], references)).toBe('run-a');
    expect(runOfSelection(['a2', 'a1'], references)).toBe('run-a');
  });

  it('refuses a book named twice', () => {
    expect(() => runOfSelection(['a1', 'a1'], references)).toThrow('more than once');
  });

  it('refuses an id the app never gave, wherever it is in the list', () => {
    expect(() => runOfSelection(['made-up'], references)).toThrow('one conversion at a time');
    expect(() => runOfSelection(['a1', 'made-up'], references)).toThrow('one conversion at a time');
    expect(() => runOfSelection(['made-up', 'a1'], references)).toThrow('one conversion at a time');
  });

  it('refuses books of two runs, and an empty selection', () => {
    expect(() => runOfSelection(['a1', 'b1'], references)).toThrow('one conversion at a time');
    expect(() => runOfSelection(['b1', 'a1'], references)).toThrow('one conversion at a time');
    expect(() => runOfSelection([], references)).toThrow('one conversion at a time');
  });
});

describe('when a pending run may be deleted', () => {
  it('may be, when it is not shared and nothing is converting', () => {
    expect(
      discardRefusal({ runId: 'run', sharingRunId: undefined, activeJobs: 0 }),
    ).toBeUndefined();
    expect(
      discardRefusal({ runId: 'run', sharingRunId: 'another', activeJobs: 0 }),
    ).toBeUndefined();
  });

  it('may not while its books are shared', () => {
    expect(discardRefusal({ runId: 'run', sharingRunId: 'run', activeJobs: 0 })).toEqual({
      code: 'pending_in_use',
      message: 'Stop sharing these books before deleting their pending copies.',
    });
  });

  it('may not while a conversion runs, which could be making books in it', () => {
    expect(discardRefusal({ runId: 'run', sharingRunId: undefined, activeJobs: 1 })).toEqual({
      code: 'pending_in_use',
      message: 'Wait for the current conversion to finish before deleting pending books.',
    });
  });

  it('says first that it is shared, when both are true', () => {
    expect(discardRefusal({ runId: 'run', sharingRunId: 'run', activeJobs: 2 })?.message).toContain(
      'Stop sharing',
    );
  });
});

describe('where a book may be saved to', () => {
  it.each([
    ['epub', 'C:\\Books\\Book.epub'],
    ['epub', '/books/Book.EPUB'],
    ['cbz', '/books/Book.cbz'],
    ['pdf', '/books/Book.Pdf'],
  ] as const)('accepts a %s book saved as %s', (format, destination) => {
    expect(wrongExtension(format, destination)).toBeUndefined();
  });

  it.each([
    ['epub', '/books/Book.cbz', '.epub'],
    ['cbz', '/books/Book.epub', '.cbz'],
    ['pdf', '/books/Book', '.pdf'],
    ['epub', '/books/Book.epub.exe', '.epub'],
  ] as const)(
    'refuses a %s book saved as %s, and says to choose a %s file',
    (format, destination, wanted) => {
      const refusal = wrongExtension(format, destination);

      expect(refusal).toBeInstanceOf(PendingSaveError);
      expect(refusal).toMatchObject({
        code: 'wrong_extension',
        message: `Choose a ${wanted} file for this book.`,
      });
    },
  );
});

describe('inspecting a selection', () => {
  const selection: InputSelection = {
    inputPath: '/manga/Series',
    displayName: 'Series',
    kind: 'folder',
  };

  it('inspects what the id stands for, and spends the id', async () => {
    const selections = new Map([['id', selection]]);
    const inspect = vi.fn(() => Promise.resolve('inspected'));

    expect(await inspectOnce(selections, 'id', inspect)).toEqual({ ok: true, value: 'inspected' });
    expect(inspect).toHaveBeenCalledExactlyOnceWith(selection);
    expect(selections.has('id')).toBe(false);
  });

  it('does not let an id be used a second time', async () => {
    const selections = new Map([['id', selection]]);
    const inspect = vi.fn(() => Promise.resolve('inspected'));
    await inspectOnce(selections, 'id', inspect);

    expect(await inspectOnce(selections, 'id', inspect)).toEqual({
      ok: false,
      error: { code: 'selection_not_found', message: 'Choose the input again.' },
    });
    expect(inspect).toHaveBeenCalledTimes(1);
  });

  it('spends the id even when the inspection fails, and lets the failure through', async () => {
    const selections = new Map([['id', selection]]);
    const failure = new Error('not a manga folder');

    await expect(inspectOnce(selections, 'id', () => Promise.reject(failure))).rejects.toBe(
      failure,
    );
    expect(selections.has('id')).toBe(false);
  });

  it('knows nothing of an id the app never gave', async () => {
    const inspect = vi.fn();

    expect(await inspectOnce(new Map(), 'made-up', inspect)).toMatchObject({ ok: false });
    expect(inspect).not.toHaveBeenCalled();
  });
});

describe('acting on a saved book', () => {
  const gone = {
    ok: false,
    error: { code: 'artifact_not_found', message: 'The saved book is no longer available.' },
  };
  const paths = new Map([['id', '/books/Book.epub']]);
  const file = { isFile: () => true };

  it('acts on a path that is still a file, and says it worked', async () => {
    const act = vi.fn(() => Promise.resolve());
    const stat = vi.fn(() => Promise.resolve(file));

    expect(await withSavedBook(paths, 'id', act, stat)).toEqual({ ok: true, value: undefined });
    expect(stat).toHaveBeenCalledWith('/books/Book.epub');
    expect(act).toHaveBeenCalledExactlyOnceWith('/books/Book.epub');
  });

  it('is gone for an id the app never gave, and looks at nothing', async () => {
    const act = vi.fn();
    const stat = vi.fn();

    expect(await withSavedBook(paths, 'made-up', act, stat)).toEqual(gone);
    expect(stat).not.toHaveBeenCalled();
    expect(act).not.toHaveBeenCalled();
  });

  it('is gone for a path that is a folder now, and does not open it', async () => {
    const act = vi.fn();

    expect(
      await withSavedBook(paths, 'id', act, () => Promise.resolve({ isFile: () => false })),
    ).toEqual(gone);
    expect(act).not.toHaveBeenCalled();
  });

  it('is gone for a path that cannot be looked at, such as one that was moved away', async () => {
    const act = vi.fn();

    expect(
      await withSavedBook(paths, 'id', act, () => Promise.reject(new Error('ENOENT'))),
    ).toEqual(gone);
    expect(act).not.toHaveBeenCalled();
  });

  it('lets a failure of the action through, since it is not that the book is gone', async () => {
    const failure = new Error('no program opens it');

    await expect(
      withSavedBook(
        paths,
        'id',
        () => Promise.reject(failure),
        () => Promise.resolve(file),
      ),
    ).rejects.toBe(failure);
  });
});

describe('what the app remembers of the options', () => {
  const network = { name: 'Ethernet', address: '192.168.18.39' };
  const chosen: Preferences = { ...defaultPreferences, format: 'cbz' };

  it('takes what the settings file brought back, and forgets what it does not have', () => {
    const state = {
      ...nothingRemembered,
      lastPickerFolder: '/old',
      lastSaveFolder: '/old',
      preferredNetworkInterface: network,
    };
    const restored: RestoredPreferences = { preferences: chosen, notices: [] };

    remember(state, restored);

    expect(state).toEqual({
      currentPreferences: chosen,
      lastPickerFolder: undefined,
      lastSaveFolder: undefined,
      preferences: undefined,
      preferredNetworkInterface: undefined,
    });
  });

  it('takes every folder and the network of a file that holds them', () => {
    const state = { ...nothingRemembered };

    remember(state, {
      preferences: chosen,
      outputFolder: '/saves',
      lastPickerFolder: '/pickers',
      preferredNetworkInterface: network,
      notices: [],
    });

    expect(state).toMatchObject({
      currentPreferences: chosen,
      lastSaveFolder: '/saves',
      lastPickerFolder: '/pickers',
      preferredNetworkInterface: network,
    });
  });

  it('keeps what the window chose, and writes it down with the folders the window never holds', async () => {
    const state = { ...nothingRemembered, lastSaveFolder: '/saves', lastPickerFolder: '/pickers' };
    const save = vi.fn(() => Promise.resolve());

    await saveChosen(state, { save }, { preferences: chosen, preferredNetworkInterface: network });

    expect(state.currentPreferences).toBe(chosen);
    expect(state.preferredNetworkInterface).toBe(network);
    expect(save).toHaveBeenCalledExactlyOnceWith(chosen, '/saves', '/pickers', network);
  });

  it('forgets the network when the window no longer has one chosen', async () => {
    const state = { ...nothingRemembered, preferredNetworkInterface: network };
    const save = vi.fn(() => Promise.resolve());

    await saveChosen(state, { save }, { preferences: chosen });

    expect(state.preferredNetworkInterface).toBeUndefined();
    expect(save).toHaveBeenCalledWith(chosen, undefined, undefined, undefined);
  });

  it('lets a failure to save through, for the window to be told', async () => {
    const failure = new Error('read only');

    await expect(
      saveChosen(
        { ...nothingRemembered },
        { save: () => Promise.reject(failure) },
        {
          preferences: chosen,
        },
      ),
    ).rejects.toBe(failure);
  });
});

describe('what the app lets go of when it quits', () => {
  function cleanup(overrides: Partial<QuitCleanup> = {}, order: string[] = []) {
    const step = (name: string) => () => {
      order.push(name);
      return Promise.resolve();
    };
    return {
      order,
      cleanup: {
        activeJobs: new Map<string, { readonly abort: () => void }>(),
        releaseAll: step('release'),
        stopSharing: step('stop sharing'),
        settlePreferences: step('settle preferences'),
        pruneCompleted: step('prune'),
        ...overrides,
      } satisfies QuitCleanup,
    };
  }

  it('stops the conversions, lets go of the rest, removes the finished runs last, and then quits', async () => {
    const { cleanup: steps, order } = cleanup();
    const abort = vi.fn(() => order.push('abort'));
    const quit = vi.fn(() => order.push('quit'));

    await cleanUpBeforeQuit(
      {
        ...steps,
        activeJobs: new Map([
          ['one', { abort }],
          ['two', { abort }],
        ]),
      },
      quit,
      vi.fn(),
    );

    expect(abort).toHaveBeenCalledTimes(2);
    expect(order).toEqual([
      'abort',
      'abort',
      'release',
      'stop sharing',
      'settle preferences',
      'prune',
      'quit',
    ]);
  });

  it('waits for every one to finish before it removes anything', async () => {
    let finish: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const { cleanup: steps, order } = cleanup({ stopSharing: () => slow.then(() => undefined) });
    const done = cleanUpBeforeQuit(steps, () => order.push('quit'), vi.fn());

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(order).not.toContain('prune');
    finish();
    await done;

    expect(order.indexOf('prune')).toBeGreaterThan(order.indexOf('settle preferences'));
    expect(order.at(-1)).toBe('quit');
  });

  it('goes on to remove the finished runs when something it let go of failed', async () => {
    const { cleanup: steps, order } = cleanup({
      releaseAll: () => Promise.reject(new Error('busy')),
    });
    const report = vi.fn();

    await cleanUpBeforeQuit(steps, () => order.push('quit'), report);

    expect(order).toContain('prune');
    expect(report).not.toHaveBeenCalled();
  });

  it('says when the finished runs could not be removed, and quits all the same', async () => {
    const failure = new Error('permission denied');
    const { cleanup: steps, order } = cleanup({ pruneCompleted: () => Promise.reject(failure) });
    const report = vi.fn();

    await cleanUpBeforeQuit(steps, () => order.push('quit'), report);

    expect(report).toHaveBeenCalledExactlyOnceWith(
      'Could not clear exported pending books.',
      failure,
    );
    expect(order.at(-1)).toBe('quit');
  });

  it('has nothing to do for what was never set up, and still quits', async () => {
    const quit = vi.fn();

    await cleanUpBeforeQuit(
      {
        activeJobs: new Map(),
        releaseAll: undefined,
        stopSharing: undefined,
        settlePreferences: undefined,
        pruneCompleted: undefined,
      },
      quit,
      vi.fn(),
    );

    expect(quit).toHaveBeenCalledOnce();
  });
});
