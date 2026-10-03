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
  readonly noProcessing?: boolean;
  readonly quiet?: boolean;
  readonly webtoon?: boolean;
  readonly mangaStyle?: boolean;
  readonly cropping?: CroppingMode;
  readonly croppingPower?: number;
  readonly croppingMinimum?: number;
  readonly preserveMargin?: number;
  readonly splitter?: SplitterMode;
  readonly noRotate?: boolean;
  readonly rotateFirst?: boolean;
  readonly maximizeStrips?: boolean;
  readonly upscale?: boolean;
  readonly stretch?: boolean;
  readonly wallpaper?: boolean;
  readonly whiteBorders?: boolean;
  readonly blackBorders?: boolean;
  readonly spreadShift?: boolean;
  readonly onePageLandscape?: boolean;
  readonly invertDirection?: boolean;
  readonly forceColor?: boolean;
  readonly forcePng?: boolean;
  readonly noQuantize?: boolean;
  readonly pngLegacy?: boolean;
  readonly forcePngRgb?: boolean;
  readonly jpegQuality?: number;
  readonly rotateRight?: boolean;
  readonly gamma?: number;
  readonly autoLevel?: boolean;
  readonly noAutoContrast?: boolean;
  readonly colorAutoContrast?: boolean;
  readonly interPanelCrop?: InterPanelCropMode;
  readonly eraseRainbow?: boolean;
  readonly title?: string;
  readonly author?: string;
  readonly metadataTitle?: MetadataTitleMode;
  readonly keepComicInfo?: boolean;
  readonly language?: string;
  readonly customWidth?: number;
  readonly customHeight?: number;
  /** Build a nested volume/chapter table of contents instead of a flat one - EPUB only. */
  readonly nestedToc?: boolean;
}

export function buildMangapressArguments(request: MangapressRunArguments): readonly string[] {
  // A value is attached to its flag (`--title=-Hidden`) and never sent as an argument of its own:
  // mangapress reads a separate argument that starts with a hyphen as an option and refuses the run.
  const optionalValue = (flag: string, value: string | number | undefined): readonly string[] =>
    value === undefined ? [] : [`${flag}=${String(value)}`];
  const enabled = (flag: string, value: boolean | undefined): readonly string[] =>
    value === true ? [flag] : [];
  return [
    request.inputPath,
    '--profile',
    request.profile,
    ...(request.dryRun ? ['--dry-run'] : []),
    ...enabled('--noprocessing', request.noProcessing),
    ...enabled('--quiet', request.quiet),
    ...enabled('--webtoon', request.webtoon),
    ...enabled('--manga-style', request.mangaStyle),
    ...optionalValue('--cropping', request.cropping),
    ...optionalValue('--croppingpower', request.croppingPower),
    ...optionalValue('--croppingminimum', request.croppingMinimum),
    ...optionalValue('--preservemargin', request.preserveMargin),
    ...optionalValue('--splitter', request.splitter),
    ...enabled('--norotate', request.noRotate),
    ...enabled('--rotatefirst', request.rotateFirst),
    ...enabled('--maximizestrips', request.maximizeStrips),
    ...enabled('--upscale', request.upscale),
    ...enabled('--stretch', request.stretch),
    ...enabled('--wallpaper', request.wallpaper),
    ...enabled('--whiteborders', request.whiteBorders),
    ...enabled('--blackborders', request.blackBorders),
    ...enabled('--spreadshift', request.spreadShift),
    ...enabled('--onepagelandscape', request.onePageLandscape),
    ...enabled('--invertdirection', request.invertDirection),
    ...enabled('--forcecolor', request.forceColor),
    ...enabled('--forcepng', request.forcePng),
    ...enabled('--noquantize', request.noQuantize),
    ...enabled('--pnglegacy', request.pngLegacy),
    ...enabled('--force-png-rgb', request.forcePngRgb),
    ...optionalValue('--jpeg-quality', request.jpegQuality),
    ...enabled('--rotateright', request.rotateRight),
    ...optionalValue('--gamma', request.gamma),
    ...enabled('--autolevel', request.autoLevel),
    ...enabled('--noautocontrast', request.noAutoContrast),
    ...enabled('--colorautocontrast', request.colorAutoContrast),
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
    ...enabled('--nested-toc', request.nestedToc),
    '--json-events',
  ];
}
