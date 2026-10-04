import { readFile } from 'node:fs/promises';

import { protocol } from 'electron';

import { contentTypeFor, rendererFile, rendererLocation, rendererScheme } from './renderer-files';

const location = rendererLocation(MAIN_WINDOW_WEBPACK_ENTRY);

/** Where the window loads its page from: the development server, or the packaged scheme. */
export const rendererUrl = location.url;

/**
 * Makes the packaged scheme one the page can load from like a web origin (scripts, styles and the
 * CSP's 'self' all need that). Electron only accepts this before the app is ready.
 */
export function registerRendererScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: rendererScheme, privileges: { standard: true, secure: true } },
  ]);
}

/** Answers the page's requests on the packaged scheme from the folder the build put it in. */
export function serveRenderer(): void {
  const { root } = location;
  if (root === undefined) return;
  protocol.handle(rendererScheme, async (request) => {
    if (request.method !== 'GET') return new Response(null, { status: 405 });
    const file = rendererFile(root, request.url);
    if (file === undefined) return new Response(null, { status: 404 });
    try {
      return new Response(new Uint8Array(await readFile(file)), {
        headers: {
          'content-type': contentTypeFor(file),
          'x-content-type-options': 'nosniff',
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}
