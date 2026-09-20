import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  defaultStoredSettings,
  parseStoredSettings,
  serializeStoredSettings,
} from './stored-settings';

import {
  SettingsSaveError,
  type SettingsLoad,
  type SettingsStorePort,
  type StoredSettings,
} from '@/application/ports/settings-store';

export interface FsSettingsStoreDeps {
  readonly readFile: typeof readFile;
  readonly writeFile: typeof writeFile;
  readonly rename: typeof rename;
  readonly mkdir: typeof mkdir;
  readonly rm: typeof rm;
  readonly createTempSuffix: () => string;
}

function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/** The settings file of one person: read once at launch, rewritten whenever they change. */
export class FsSettingsStore implements SettingsStorePort {
  private readonly io: FsSettingsStoreDeps;
  // Every write waits for the one before it, so the last save asked for is the last one written.
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    deps: Partial<FsSettingsStoreDeps> = {},
  ) {
    this.io = {
      readFile: deps.readFile ?? readFile,
      writeFile: deps.writeFile ?? writeFile,
      rename: deps.rename ?? rename,
      mkdir: deps.mkdir ?? mkdir,
      rm: deps.rm ?? rm,
      createTempSuffix: deps.createTempSuffix ?? randomUUID,
    };
  }

  async load(): Promise<SettingsLoad> {
    let raw: string;
    try {
      raw = await this.io.readFile(this.filePath, 'utf8');
    } catch (error) {
      // No file is how a first launch looks; any other failure is a file that is there and unusable.
      return { settings: defaultStoredSettings, unreadable: !isEnoent(error) };
    }
    const settings = parseStoredSettings(raw);
    return settings === undefined
      ? { settings: defaultStoredSettings, unreadable: true }
      : { settings, unreadable: false };
  }

  save(settings: StoredSettings): Promise<void> {
    const written = this.tail.then(() => this.write(settings));
    this.tail = written.catch(() => undefined);
    return written;
  }

  settled(): Promise<void> {
    return this.tail;
  }

  /** Writes beside the file and renames over it, so the file is either the old one or the new one. */
  private async write(settings: StoredSettings): Promise<void> {
    const temporaryPath = `${this.filePath}.${this.io.createTempSuffix()}.tmp`;
    try {
      await this.io.mkdir(path.dirname(this.filePath), { recursive: true });
      await this.io.writeFile(temporaryPath, serializeStoredSettings(settings), 'utf8');
      await this.io.rename(temporaryPath, this.filePath);
    } catch (error) {
      await this.io.rm(temporaryPath, { force: true }).catch(() => undefined);
      throw new SettingsSaveError({ cause: error });
    }
  }
}
