import type { MainContext } from '../context';

type Remembering = Pick<
  MainContext,
  | 'lastPickerFolder'
  | 'lastSaveFolder'
  | 'preferences'
  | 'currentPreferences'
  | 'preferredNetworkInterface'
>;

type Report = (message: string, cause: unknown) => void;

const reportToLog: Report = (message, cause) => {
  console.error(message, cause);
};

/**
 * Writes the last known options and sharing interface down with the two folders as they now stand,
 * rather than reading the file back first: that read would race the window's own save of the very
 * same choice, and the slower of the two could lose it (see `currentPreferences`). Not being able to
 * is reported and never stops what the person was doing.
 */
function write(
  context: Remembering,
  saveFolder: string | undefined,
  pickerFolder: string | undefined,
  failure: string,
  report: Report,
): void {
  const saved = context.preferences?.save(
    context.currentPreferences,
    saveFolder,
    pickerFolder,
    context.preferredNetworkInterface,
  );
  void saved?.catch((error: unknown) => {
    report(failure, error);
  });
}

/** Where the next Save dialog opens, in memory now and on disk right away. */
export function rememberSaveFolder(
  context: Remembering,
  folder: string,
  report: Report = reportToLog,
): void {
  context.lastSaveFolder = folder;
  write(
    context,
    folder,
    context.lastPickerFolder,
    'Could not remember the last Save dialog location.',
    report,
  );
}

/** Where the next dialog that chooses files or folders opens, in memory now and on disk right away. */
export function rememberPickerFolder(
  context: Remembering,
  folder: string,
  report: Report = reportToLog,
): void {
  context.lastPickerFolder = folder;
  write(
    context,
    context.lastSaveFolder,
    folder,
    'Could not remember the last input dialog location.',
    report,
  );
}
