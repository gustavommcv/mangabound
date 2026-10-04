import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const script = path.resolve('scripts/verify-package-permissions.mjs');

function verify(listing: string): { readonly status: number | null; readonly output: string } {
  const run = spawnSync(process.execPath, [script, 'mangabound.deb'], {
    encoding: 'utf8',
    input: listing,
  });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

const debListing = (...lines: readonly string[]): string => lines.join('\n') + '\n';

describe('the package permission check', () => {
  it('accepts a package whose folders and files anyone can use', () => {
    const run = verify(
      debListing(
        'drwxr-xr-x root/root         0 2026-10-04 10:00 ./opt/mangabound/',
        '-rwxr-xr-x root/root  12345678 2026-10-04 10:00 ./opt/mangabound/mangabound',
        '-rw-r--r-- root/root      1234 2026-10-04 10:00 ./opt/mangabound/resources/app.asar',
        'drwxr-xr-x root/root         0 2026-10-04 10:00 ./opt/mangabound/resources/toolchain/',
        '-rwxr-xr-x root/root   9876543 2026-10-04 10:00 ./opt/mangabound/resources/toolchain/mangapress',
        '-rwsr-xr-x root/root    123456 2026-10-04 10:00 ./opt/mangabound/chrome-sandbox',
        'lrwxrwxrwx root/root         0 2026-10-04 10:00 ./usr/bin/mangabound -> /opt/mangabound/mangabound',
      ),
    );
    expect(run.status).toBe(0);
    expect(run.output).toContain('mangabound.deb: 7 entries');
  });

  it('refuses a folder only its owner can open, which is how the bundled tools were left', () => {
    const run = verify(
      debListing(
        'drwxr-xr-x root/root         0 2026-10-04 10:00 ./opt/mangabound/resources/',
        'drwx------ root/root         0 2026-10-04 10:00 ./opt/mangabound/resources/toolchain/linux-x64/',
        '-rwxr-xr-x root/root   9876543 2026-10-04 10:00 ./opt/mangabound/resources/toolchain/linux-x64/mangapress',
      ),
    );
    expect(run.status).toBe(1);
    expect(run.output).toContain('1 of 3 entries');
    expect(run.output).toContain('a folder that only its owner can open');
    expect(run.output).toContain('toolchain/linux-x64/');
  });

  it.each([
    [
      'a folder others can read but not enter',
      'dr-xr-xr-- root/root 0 2026-10-04 10:00 ./a/',
      'a folder',
    ],
    [
      'a folder others can enter but not list',
      'drwxr-x--x root/root 0 2026-10-04 10:00 ./a/',
      'a folder',
    ],
    [
      'a file only its owner can read',
      '-rw------- root/root 10 2026-10-04 10:00 ./a/file',
      'a file',
    ],
    [
      'a program only its owner can run',
      '-rwxr-xr-- root/root 10 2026-10-04 10:00 ./a/tool',
      'a program',
    ],
    [
      'a setuid program only its owner can run',
      '-rwsr-xr-- root/root 10 2026-10-04 10:00 ./a/tool',
      'a program',
    ],
  ])('refuses %s', (_description, line, kind) => {
    const run = verify(debListing(line));
    expect(run.status).toBe(1);
    expect(run.output).toContain(`${kind} that only its owner can`);
    expect(run.output).toContain('1 of 1 entries cannot be used by someone who is not root');
  });

  it('accepts a sticky folder, which others can still enter', () => {
    expect(verify(debListing('drwxrwxrwt root/root 0 2026-10-04 10:00 ./tmp/')).status).toBe(0);
  });

  it('accepts a file that is only readable, since it is not meant to run', () => {
    expect(verify(debListing('-rw-r--r-- root/root 10 2026-10-04 10:00 ./a/readme')).status).toBe(
      0,
    );
  });

  it('reads the listing of an rpm, where the mode is followed by a link count', () => {
    const run = verify(
      [
        'drwxr-xr-x    2 root    root                        0 Oct  4 10:00 /opt/mangabound',
        'drwx------    2 root    root                        0 Oct  4 10:00 /opt/mangabound/resources/toolchain',
      ].join('\n'),
    );
    expect(run.status).toBe(1);
    expect(run.output).toContain('1 of 2 entries');
  });

  it('reads the listing of an Arch package, which tar prints like a deb', () => {
    const run = verify(
      debListing(
        'drwxr-xr-x root/root         0 2026-10-04 10:00:00 opt/mangabound/',
        '-rwxr-xr-x root/root   9876543 2026-10-04 10:00:00 opt/mangabound/mangabound',
      ),
    );
    expect(run.status).toBe(0);
  });

  it('skips lines that are not entries, such as the heading of a listing', () => {
    const run = verify(
      debListing('Package: mangabound', '', '-rw-r--r-- root/root 10 2026-10-04 10:00 ./a/file'),
    );
    expect(run.status).toBe(0);
    expect(run.output).toContain('1 entries');
  });

  it('shows the first twenty offenders and counts the rest', () => {
    const lines = Array.from(
      { length: 23 },
      (_, index) => `-rw------- root/root 10 2026-10-04 10:00 ./secret/${String(index)}`,
    );
    const run = verify(debListing(...lines));
    expect(run.status).toBe(1);
    expect(run.output).toContain('23 of 23 entries');
    expect(run.output).toContain('./secret/19');
    expect(run.output).not.toContain('./secret/20');
    expect(run.output).toContain('and 3 more');
  });

  it('fails, rather than pass, when the input is not a package listing at all', () => {
    const run = verify('this is not a listing\n');
    expect(run.status).toBe(2);
    expect(run.output).toContain('Is it a package listing?');
  });
});
