import path from 'node:path';

/**
 * Where the app's own folders are on Windows. Not `Mangabound`: the installer puts the app in
 * `%LOCALAPPDATA%\mangabound`, which Windows takes for the same name, and uninstalling removes
 * everything in that folder, a person's unsaved books with it.
 */
const windowsStorageFolder = 'Mangabound Data';

function windowsLocalAppData(environment: NodeJS.ProcessEnv, home: string): string {
  const localAppData = environment.LOCALAPPDATA;
  return localAppData !== undefined && path.isAbsolute(localAppData)
    ? localAppData
    : path.join(home, 'AppData', 'Local');
}

/**
 * What to move out of the folder an earlier version kept pending books and covers in (the
 * installer's own) into where they are kept now, or `undefined` where there is nothing to move: a
 * platform that never had that installer, or a root chosen by the environment, which no version
 * kept in the installer's folder. A covers root chosen by the environment is left out of the
 * move, since nothing reads the covers from the folder they would be moved to.
 */
export function legacyStorageMove(
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
  home: string,
): { readonly from: string; readonly to: string; readonly folders: readonly string[] } | undefined {
  if (platform !== 'win32') return undefined;
  if (
    environment.MANGABOUND_PENDING_ROOT !== undefined &&
    path.isAbsolute(environment.MANGABOUND_PENDING_ROOT)
  ) {
    return undefined;
  }
  const coversChosen =
    environment.MANGABOUND_COVERS_ROOT !== undefined &&
    path.isAbsolute(environment.MANGABOUND_COVERS_ROOT);
  return {
    from: path.join(windowsLocalAppData(environment, home), 'Mangabound'),
    to: path.dirname(pendingRoot(platform, environment, home)),
    folders: coversChosen ? ['Pending'] : ['Pending', 'Covers'],
  };
}

/** Pending books are user work, not disposable OS temp files or roaming settings data. */
export function pendingRoot(
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
  home: string,
): string {
  if (
    environment.MANGABOUND_PENDING_ROOT !== undefined &&
    path.isAbsolute(environment.MANGABOUND_PENDING_ROOT)
  ) {
    return environment.MANGABOUND_PENDING_ROOT;
  }
  if (platform === 'win32') {
    return path.join(windowsLocalAppData(environment, home), windowsStorageFolder, 'Pending');
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Mangabound', 'Pending');
  }
  const dataHome = environment.XDG_DATA_HOME;
  return path.join(
    dataHome !== undefined && path.isAbsolute(dataHome)
      ? dataHome
      : path.join(home, '.local', 'share'),
    'mangabound',
    'pending',
  );
}

/**
 * Covers a person attached are kept beside the pending books: they are that person's own files,
 * copied so the originals can go, and no more a setting than a finished book is.
 */
export function coversRoot(
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
  home: string,
): string {
  if (
    environment.MANGABOUND_COVERS_ROOT !== undefined &&
    path.isAbsolute(environment.MANGABOUND_COVERS_ROOT)
  ) {
    return environment.MANGABOUND_COVERS_ROOT;
  }
  // The same folder the pending books are in, whatever the platform calls it, without an
  // override of theirs moving the covers along.
  const { MANGABOUND_PENDING_ROOT: ignored, ...rest } = environment;
  void ignored;
  const pending = pendingRoot(platform, rest, home);
  return path.join(
    path.dirname(pending),
    platform === 'win32' || platform === 'darwin' ? 'Covers' : 'covers',
  );
}
