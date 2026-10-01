import { uniqueFileName } from './unique-name';

/** Internal save reasons are independent of their user-facing wording. */
export class PendingSaveError extends Error {
  constructor(
    readonly code: 'book_unavailable' | 'run_deleting' | 'wrong_extension' | 'name_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'PendingSaveError';
  }
}

function systemCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

/** The existing Save All budget: the original name, then copies (2) through (998). */
const saveNameAttempts = 998;

/** Exclusive publication, not a prior existence check, decides whether a name is taken. */
export async function saveWithUniqueName<Value>(
  name: string,
  save: (candidate: string) => Promise<Value>,
): Promise<Value> {
  const taken = new Set<string>();
  for (let attempt = 0; attempt < saveNameAttempts; attempt++) {
    const candidate = uniqueFileName(name, (value) => taken.has(value));
    try {
      return await save(candidate);
    } catch (error) {
      if (systemCode(error) !== 'EEXIST') throw error;
      taken.add(candidate);
    }
  }
  throw new PendingSaveError('name_unavailable', 'No available file name was found.');
}

/** Safe save messages; no paths, raw operating-system errors or message-prefix matching. */
export function pendingSaveMessage(error: unknown): string {
  if (error instanceof PendingSaveError) return error.message;
  const code = systemCode(error);
  if (code === 'ENOSPC')
    return 'The destination is full. Free some space and try again; the pending book is safe.';
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS')
    return 'Mangabound cannot write to that destination. Choose a writable folder or check its permissions.';
  if (code === 'ENOENT')
    return 'The chosen destination folder is no longer available. Choose another folder.';
  return 'The book could not be saved. Its pending copy is still available; try another destination.';
}
