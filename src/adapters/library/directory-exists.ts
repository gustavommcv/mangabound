import { stat } from 'node:fs/promises';

/** Whether a path is a folder that is there now. Anything else, including an error, is a no. */
export async function directoryExists(directory: string): Promise<boolean> {
  try {
    return (await stat(directory)).isDirectory();
  } catch {
    return false;
  }
}
