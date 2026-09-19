import { describe, expect, it } from 'vitest';

import {
  batchProcessModes,
  blockedModeReason,
  defaultProcessMode,
  modeFromSteps,
  processModes,
  resolveMode,
  stepsFromMode,
  unsupportedModeReason,
  usesMangapress,
} from '@/domain/process-mode';

describe('process modes', () => {
  it('is a closed set of three, and a batch can only join or join-and-convert', () => {
    expect(processModes).toEqual(['bind-and-convert', 'bind-only', 'convert-only']);
    expect(batchProcessModes).toEqual(['bind-and-convert', 'bind-only']);
    expect(defaultProcessMode).toBe('bind-and-convert');
  });

  it('maps the two checkboxes to a mode and back, without losing information', () => {
    expect(modeFromSteps({ group: true, convert: true })).toBe('bind-and-convert');
    expect(modeFromSteps({ group: true, convert: false })).toBe('bind-only');
    expect(modeFromSteps({ group: false, convert: true })).toBe('convert-only');
    // The interface never lets both go off; a caller that gets there anyway runs the ordinary mode.
    expect(modeFromSteps({ group: false, convert: false })).toBe('bind-and-convert');

    for (const mode of processModes) {
      expect(modeFromSteps(stepsFromMode(mode))).toBe(mode);
    }
  });

  it('knows which modes run mangapress', () => {
    expect(usesMangapress('bind-and-convert')).toBe(true);
    expect(usesMangapress('convert-only')).toBe(true);
    expect(usesMangapress('bind-only')).toBe(false);
  });

  it('explains why a mode cannot run on a CBZ or on a library, and allows everything else', () => {
    expect(unsupportedModeReason('cbz', 'bind-only')).toMatch(/already one volume/u);
    expect(unsupportedModeReason('library', 'convert-only')).toMatch(/title by title/u);

    expect(unsupportedModeReason('folder', 'bind-only')).toBeUndefined();
    expect(unsupportedModeReason('folder', 'convert-only')).toBeUndefined();
    expect(unsupportedModeReason('folder', 'bind-and-convert')).toBeUndefined();
    expect(unsupportedModeReason('cbz', 'convert-only')).toBeUndefined();
    expect(unsupportedModeReason('cbz', 'bind-and-convert')).toBeUndefined();
    expect(unsupportedModeReason('library', 'bind-only')).toBeUndefined();
    expect(unsupportedModeReason('library', 'bind-and-convert')).toBeUndefined();
  });

  it('offers a CBZ only the straight-to-mangapress process and a library only the two that group', () => {
    for (const mode of processModes) {
      expect(blockedModeReason('folder', mode)).toBeUndefined();
    }
    expect(blockedModeReason('cbz', 'convert-only')).toBeUndefined();
    expect(blockedModeReason('cbz', 'bind-only')).toMatch(/already one volume/u);
    expect(blockedModeReason('cbz', 'bind-and-convert')).toMatch(/already one volume/u);
    expect(blockedModeReason('library', 'convert-only')).toMatch(/title by title/u);
    expect(blockedModeReason('library', 'bind-only')).toBeUndefined();
    expect(blockedModeReason('library', 'bind-and-convert')).toBeUndefined();
  });

  it('carries a choice over to another input by settling on the nearest mode that input allows', () => {
    for (const mode of processModes) {
      expect(resolveMode('folder', mode)).toBe(mode);
      expect(resolveMode('cbz', mode)).toBe('convert-only');
    }
    expect(resolveMode('library', 'convert-only')).toBe('bind-and-convert');
    expect(resolveMode('library', 'bind-only')).toBe('bind-only');
    expect(resolveMode('library', 'bind-and-convert')).toBe('bind-and-convert');
  });
});
