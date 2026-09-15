export type MangapressFormat = 'epub' | 'cbz' | 'pdf';

import type {
  CroppingMode,
  InterPanelCropMode,
  MetadataTitleMode,
  SplitterMode,
} from '@/domain/output-profile';

export interface MangapressRunArguments {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly profile: string;
  readonly format: MangapressFormat;
  readonly dryRun: boolean;
  readonly quiet?: boolean;
  readonly mangaStyle?: boolean;
  readonly cropping?: CroppingMode;
  readonly croppingPower?: number;
  readonly croppingMinimum?: number;
  readonly preserveMargin?: number;
  readonly splitter?: SplitterMode;
  readonly upscale?: boolean;
  readonly stretch?: boolean;
  readonly wallpaper?: boolean;
  readonly whiteBorders?: boolean;
  readonly forcePng?: boolean;
  readonly jpegQuality?: number;
  readonly rotateRight?: boolean;
  readonly gamma?: number;
  readonly autoLevel?: boolean;
  readonly noAutoContrast?: boolean;
  readonly interPanelCrop?: InterPanelCropMode;
  readonly eraseRainbow?: boolean;
  readonly title?: string;
  readonly author?: string;
  readonly metadataTitle?: MetadataTitleMode;
  readonly keepComicInfo?: boolean;
  readonly language?: string;
  readonly customWidth?: number;
  readonly customHeight?: number;
}

export function buildMangapressArguments(request: MangapressRunArguments): readonly string[] {
  const optionalValue = (flag: string, value: string | number | undefined): readonly string[] =>
    value === undefined ? [] : [flag, String(value)];
  const enabled = (flag: string, value: boolean | undefined): readonly string[] =>
    value === true ? [flag] : [];
  return [
    request.inputPath,
    '--profile',
    request.profile,
    ...(request.dryRun ? ['--dry-run'] : []),
    ...enabled('--quiet', request.quiet),
    ...enabled('--manga-style', request.mangaStyle),
    ...optionalValue('--cropping', request.cropping),
    ...optionalValue('--croppingpower', request.croppingPower),
    ...optionalValue('--croppingminimum', request.croppingMinimum),
    ...optionalValue('--preservemargin', request.preserveMargin),
    ...optionalValue('--splitter', request.splitter),
    ...enabled('--upscale', request.upscale),
    ...enabled('--stretch', request.stretch),
    ...enabled('--wallpaper', request.wallpaper),
    ...enabled('--whiteborders', request.whiteBorders),
    ...enabled('--forcepng', request.forcePng),
    ...optionalValue('--jpeg-quality', request.jpegQuality),
    ...enabled('--rotateright', request.rotateRight),
    ...optionalValue('--gamma', request.gamma),
    ...enabled('--autolevel', request.autoLevel),
    ...enabled('--noautocontrast', request.noAutoContrast),
    ...optionalValue('--ipc', request.interPanelCrop),
    ...enabled('--eraserainbow', request.eraseRainbow),
    '--format',
    request.format,
    '--output',
    request.outputPath,
    ...optionalValue('--title', request.title),
    ...optionalValue('--author', request.author),
    ...optionalValue('--metadatatitle', request.metadataTitle),
    ...enabled('--keepcomicinfo', request.keepComicInfo),
    ...optionalValue('--language', request.language),
    ...optionalValue('--customwidth', request.customWidth),
    ...optionalValue('--customheight', request.customHeight),
    '--json-events',
  ];
}
