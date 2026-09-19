import { stat } from 'node:fs/promises';
import path from 'node:path';

import type { QueueRowKind } from '@/domain/input-queue';

/** More than this in one go is almost certainly a mistake, and each row costs a scan. */
export const maxInputsPerAdd = 100;

export interface ClassifiedInputs {
  readonly accepted: readonly { readonly path: string; readonly kind: QueueRowKind }[];
  readonly rejected: readonly { readonly name: string; readonly reason: string }[];
}

/**
 * Decides which of the given paths can become queue rows: a folder, or a `.cbz` file. The paths
 * come from a native dialog or from files dropped on the window, so each one is checked against
 * the disk here rather than trusted.
 */
export async function classifyInputPaths(
  paths: readonly string[],
  deps: { readonly stat: typeof stat } = { stat },
): Promise<ClassifiedInputs> {
  const accepted: { path: string; kind: QueueRowKind }[] = [];
  const rejected: { name: string; reason: string }[] = [];
  for (const inputPath of paths.slice(0, maxInputsPerAdd)) {
    const name = path.basename(inputPath) || 'Item';
    let stats: Awaited<ReturnType<typeof stat>>;
    try {
      stats = await deps.stat(inputPath);
    } catch {
      rejected.push({ name, reason: 'That item could not be read.' });
      continue;
    }
    if (stats.isDirectory()) {
      accepted.push({ path: inputPath, kind: 'folder' });
    } else if (stats.isFile() && path.extname(inputPath).toLowerCase() === '.cbz') {
      accepted.push({ path: inputPath, kind: 'cbz' });
    } else {
      rejected.push({ name, reason: 'Only folders and .cbz files can be added.' });
    }
  }
  if (paths.length > maxInputsPerAdd) {
    rejected.push({
      name: `${String(paths.length - maxInputsPerAdd)} more`,
      reason: `Only the first ${String(maxInputsPerAdd)} items are added at once.`,
    });
  }
  return { accepted, rejected };
}
