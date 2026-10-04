import path from 'node:path';

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
    const localAppData = environment.LOCALAPPDATA;
    return path.join(
      localAppData !== undefined && path.isAbsolute(localAppData)
        ? localAppData
        : path.join(home, 'AppData', 'Local'),
      'Mangabound',
      'Pending',
    );
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
