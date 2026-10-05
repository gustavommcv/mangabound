import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { contentTypeFor, rendererFile, rendererLocation } from '@/main/renderer-files';

const root = path.resolve('build', 'renderer');

describe('rendererLocation', () => {
  it('keeps the development server where it is, with nothing for this app to serve', () => {
    expect(rendererLocation('http://localhost:3000/main_window')).toEqual({
      url: 'http://localhost:3000/main_window',
      root: undefined,
    });
  });

  it('turns the built page into an address on the app scheme, served from the folder around its own', () => {
    // Written the way the build writes it: `file://` and then a path of this platform, as it is.
    const entry = `file://${path.join(root, 'main_window', 'index.html')}`;

    expect(rendererLocation(entry)).toEqual({
      url: 'app://mangabound/main_window/index.html',
      root,
    });
  });
});

describe('rendererFile', () => {
  it('finds a file below the root', () => {
    expect(rendererFile(root, 'app://mangabound/main_window/index.js')).toBe(
      path.join(root, 'main_window', 'index.js'),
    );
  });

  it('decodes the name the page asked for', () => {
    expect(rendererFile(root, 'app://mangabound/main_window/a%20b.js')).toBe(
      path.join(root, 'main_window', 'a b.js'),
    );
  });

  it('keeps a file whose name only starts with two dots', () => {
    expect(rendererFile(root, 'app://mangabound/..hidden.js')).toBe(path.join(root, '..hidden.js'));
  });

  it.each([
    ['another host', 'app://elsewhere/main_window/index.js'],
    ['another scheme', 'file:///etc/passwd'],
    ['a web address', 'https://mangabound/main_window/index.js'],
    ['a name that does not decode', 'app://mangabound/main_window/%E0%A4%A.js'],
    ['an encoded backslash', 'app://mangabound/main_window%5C..%5Cpreload.js'],
    ['a NUL', 'app://mangabound/main_window/index.js%00.txt'],
    ['an address that is not one', 'not a url'],
    ['the root itself', 'app://mangabound/'],
  ])('refuses %s', (_description, requestUrl) => {
    expect(rendererFile(root, requestUrl)).toBeUndefined();
  });

  it.each([
    'app://mangabound/../secret.txt',
    'app://mangabound/main_window/../../secret.txt',
    'app://mangabound/%2e%2e/secret.txt',
    'app://mangabound/main_window/%2e%2e/%2e%2e/secret.txt',
    'app://mangabound/main_window/..%2f..%2fsecret.txt',
  ])('does not leave the root for %s', (requestUrl) => {
    const file = rendererFile(root, requestUrl);
    expect(file === undefined || file.startsWith(`${root}${path.sep}`)).toBe(true);
    expect(file).not.toBe(path.resolve(root, '..', 'secret.txt'));
  });
});

describe('contentTypeFor', () => {
  it.each([
    ['index.html', 'text/html; charset=utf-8'],
    ['index.js', 'text/javascript; charset=utf-8'],
    ['styles.css', 'text/css; charset=utf-8'],
    ['index.js.map', 'application/json; charset=utf-8'],
    ['index.js.LICENSE.txt', 'text/plain; charset=utf-8'],
    ['INDEX.HTML', 'text/html; charset=utf-8'],
  ])('calls %s %s', (file, type) => {
    expect(contentTypeFor(file)).toBe(type);
  });

  it('calls anything else a plain download, which a page cannot run', () => {
    expect(contentTypeFor('payload.exe')).toBe('application/octet-stream');
    expect(contentTypeFor('noextension')).toBe('application/octet-stream');
  });
});
