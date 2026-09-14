import { describe, expect, it } from 'vitest';

import { buildMangabindArguments } from '@/adapters/mangabind/arguments';
import { buildMangapressArguments } from '@/adapters/mangapress/arguments';

describe('CLI argument builders', () => {
  it('builds a mangabind plan without shell-escaping path values', () => {
    expect(
      buildMangabindArguments({
        inputPath: 'C:\\Manga\\São José & friends',
        outputPath: 'C:\\Temp work\\volumes',
        metadataFilePath: 'C:\\Temp work\\mangabind.json',
        dryRun: true,
      }),
    ).toEqual([
      '--input',
      'C:\\Manga\\São José & friends',
      '--output',
      'C:\\Temp work\\volumes',
      '--metadata-file',
      'C:\\Temp work\\mangabind.json',
      '--dry-run',
      '--json',
    ]);
  });

  it('builds a mangabind execution without optional plan arguments', () => {
    expect(
      buildMangabindArguments({
        inputPath: '/manga/work',
        outputPath: '/tmp/volumes',
        dryRun: false,
      }),
    ).toEqual(['--input', '/manga/work', '--output', '/tmp/volumes', '--json']);
  });

  it('builds mangapress plan and execution arguments deterministically', () => {
    const request = {
      inputPath: '/tmp/Vol. 01.cbz',
      outputPath: '/library/Vol. 01.epub',
      profile: 'KPW5',
      format: 'epub' as const,
      dryRun: false,
    };

    expect(buildMangapressArguments(request)).toEqual([
      '/tmp/Vol. 01.cbz',
      '--profile',
      'KPW5',
      '--format',
      'epub',
      '--output',
      '/library/Vol. 01.epub',
      '--json-events',
    ]);
    expect(buildMangapressArguments({ ...request, dryRun: true })).toContain('--dry-run');
  });
});
