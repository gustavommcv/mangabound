import path from 'node:path';

import { isInsideLibrary } from '@/library/paths';

/**
 * The packaged window does not load its page from `file://`: that scheme lets a page read other
 * files (see `GrantFileProtocolExtraPrivileges` in forge.config.ts), and with that privilege
 * switched off Electron cannot load a page from inside `app.asar` at all. The page is served
 * from this scheme instead, by `app-protocol.ts`, out of the folder the build put it in.
 */
export const rendererScheme = 'app';
const rendererHost = 'mangabound';

const fileEntryPrefix = 'file://';

export interface RendererLocation {
  /** Where the window loads its page from. */
  readonly url: string;
  /** The folder that serves it, or `undefined` when something else does (the development server). */
  readonly root: string | undefined;
}

/**
 * Where the page is, given the entry address the build defines (`MAIN_WINDOW_WEBPACK_ENTRY`): a
 * development server's address is kept as it is, and a built file's becomes an address on the
 * scheme above, served from the folder that holds the page's own folder. The build writes the
 * entry as `file://` followed by a path of this platform (no encoding, and on Windows with
 * backslashes), so it is cut, not parsed as a URL.
 */
export function rendererLocation(entry: string): RendererLocation {
  if (!entry.startsWith(fileEntryPrefix)) return { url: entry, root: undefined };
  const page = entry.slice(fileEntryPrefix.length);
  const pageFolder = path.dirname(page);
  return {
    url: `${rendererScheme}://${rendererHost}/${path.basename(pageFolder)}/${path.basename(page)}`,
    root: path.dirname(pageFolder),
  };
}

/**
 * The file a request on the scheme above asks for, or `undefined` when it asks for anything else:
 * another host or scheme, a name that does not decode, a backslash or a NUL, or a path that leaves
 * `root`.
 */
export function rendererFile(root: string, requestUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== `${rendererScheme}:` || url.host !== rendererHost) return undefined;
  let requested: string;
  try {
    requested = decodeURIComponent(url.pathname);
  } catch {
    return undefined;
  }
  if (requested.includes('\0') || requested.includes('\\')) return undefined;
  const file = path.resolve(root, `.${requested}`);
  return isInsideLibrary(root, file) ? file : undefined;
}

const contentTypes: ReadonlyMap<string, string> = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

/** What to tell the page a file is. Anything not named here is not something the page may run. */
export function contentTypeFor(file: string): string {
  return contentTypes.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream';
}
