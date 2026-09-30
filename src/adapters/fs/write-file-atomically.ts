import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';

import { renameWithRetry } from './rename-with-retry';

export interface AtomicWriteDeps {
  readonly writeFile: (
    filePath: string,
    contents: string,
    options: { readonly encoding: 'utf8'; readonly flag: 'wx' },
  ) => Promise<void>;
  readonly rename: (from: string, to: string) => Promise<void>;
  readonly rm: (filePath: string, options: { readonly force: true }) => Promise<void>;
  readonly createTempSuffix: () => string;
}

const fileSystem: AtomicWriteDeps = { writeFile, rename, rm, createTempSuffix: randomUUID };

/** Replaces a text file through an exclusive sibling temporary file and a retried rename. */
export async function writeFileAtomically(
  filePath: string,
  contents: string,
  io: AtomicWriteDeps = fileSystem,
): Promise<void> {
  const temporaryPath = `${filePath}.${io.createTempSuffix()}.tmp`;
  let temporaryWritten = false;
  try {
    await io.writeFile(temporaryPath, contents, { encoding: 'utf8', flag: 'wx' });
    temporaryWritten = true;
    await renameWithRetry(io.rename, temporaryPath, filePath);
  } catch (error) {
    // A failed write can leave a partial file, but EEXIST belongs to another writer.
    if (temporaryWritten || (error as NodeJS.ErrnoException | null)?.code !== 'EEXIST') {
      // A cleanup failure must not replace the error that prevented the save.
      await io.rm(temporaryPath, { force: true }).catch(() => undefined);
    }
    throw error;
  }
}
