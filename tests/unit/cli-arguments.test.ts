import { describe, expect, it } from 'vitest';

import { buildMangabindArguments } from '@/adapters/mangabind/arguments';
import { buildMangapressArguments } from '@/adapters/mangapress/arguments';
import { defaultMangapressSettings } from '@/domain/output-profile';

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

  it('builds batch and quiet mangabind arguments and rejects shared batch metadata', () => {
    expect(
      buildMangabindArguments({
        inputPath: '/library',
        outputPath: '/output',
        dryRun: false,
        batch: true,
        quiet: true,
      }),
    ).toEqual(['--input', '/library', '--output', '/output', '--batch', '--quiet', '--json']);
    expect(() =>
      buildMangabindArguments({
        inputPath: '/library',
        outputPath: '/output',
        metadataFilePath: '/shared.json',
        dryRun: false,
        batch: true,
      }),
    ).toThrow(/cannot use a shared metadata file/u);
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

  it('maps the complete mangapress conversion surface to explicit arguments', () => {
    expect(
      buildMangapressArguments({
        inputPath: '/tmp/source.cbz',
        outputPath: '/library',
        profile: 'OTHER',
        format: 'cbz',
        dryRun: true,
        quiet: true,
        mangaStyle: true,
        cropping: 'margins',
        croppingPower: 1.25,
        croppingMinimum: 70,
        preserveMargin: 3,
        splitter: 'both',
        upscale: true,
        stretch: true,
        wallpaper: true,
        whiteBorders: true,
        forcePng: true,
        jpegQuality: 92,
        rotateRight: true,
        gamma: 0.8,
        autoLevel: true,
        noAutoContrast: true,
        interPanelCrop: 'horizontal',
        eraseRainbow: true,
        title: 'A title',
        author: 'An author',
        metadataTitle: 'combine',
        keepComicInfo: true,
        language: 'pt-BR',
        customWidth: 1404,
        customHeight: 1872,
      }),
    ).toEqual([
      '/tmp/source.cbz',
      '--profile',
      'OTHER',
      '--dry-run',
      '--quiet',
      '--manga-style',
      '--cropping',
      'margins',
      '--croppingpower',
      '1.25',
      '--croppingminimum',
      '70',
      '--preservemargin',
      '3',
      '--splitter',
      'both',
      '--upscale',
      '--stretch',
      '--wallpaper',
      '--whiteborders',
      '--forcepng',
      '--jpeg-quality',
      '92',
      '--rotateright',
      '--gamma',
      '0.8',
      '--autolevel',
      '--noautocontrast',
      '--ipc',
      'horizontal',
      '--eraserainbow',
      '--format',
      'cbz',
      '--output',
      '/library',
      '--title',
      'A title',
      '--author',
      'An author',
      '--metadatatitle',
      'combine',
      '--keepcomicinfo',
      '--language',
      'pt-BR',
      '--customwidth',
      '1404',
      '--customheight',
      '1872',
      '--json-events',
    ]);
  });

  it('keeps GUI defaults aligned with mangapress defaults', () => {
    expect(defaultMangapressSettings).toMatchObject({
      deviceProfile: 'KV',
      cropping: 'margins-and-page-numbers',
      croppingPower: 1,
      croppingMinimum: 0,
      preserveMargin: 0,
      splitter: 'split',
      interPanelCrop: 'disabled',
      metadataTitle: 'series-only',
      language: 'en-US',
    });
    expect(Object.isFrozen(defaultMangapressSettings)).toBe(true);
  });
});
