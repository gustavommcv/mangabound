export type CroppingMode = 'disabled' | 'margins' | 'margins-and-page-numbers';
export type SplitterMode = 'split' | 'rotate' | 'both';
export type InterPanelCropMode = 'disabled' | 'horizontal' | 'both';
export type MetadataTitleMode = 'series-only' | 'combine' | 'title-only';

export interface MangapressSettings {
  readonly deviceProfile: string;
  readonly quiet: boolean;
  readonly mangaStyle: boolean;
  readonly cropping: CroppingMode;
  readonly croppingPower: number;
  readonly croppingMinimum: number;
  readonly preserveMargin: number;
  readonly splitter: SplitterMode;
  readonly upscale: boolean;
  readonly stretch: boolean;
  readonly wallpaper: boolean;
  readonly whiteBorders: boolean;
  readonly forcePng: boolean;
  readonly jpegQuality?: number;
  readonly rotateRight: boolean;
  readonly gamma?: number;
  readonly autoLevel: boolean;
  readonly noAutoContrast: boolean;
  readonly interPanelCrop: InterPanelCropMode;
  readonly eraseRainbow: boolean;
  readonly title?: string;
  readonly author?: string;
  readonly metadataTitle: MetadataTitleMode;
  readonly keepComicInfo: boolean;
  readonly language: string;
  readonly customWidth?: number;
  readonly customHeight?: number;
}

export interface OutputProfile {
  readonly id: string;
  readonly name: string;
  readonly settings: MangapressSettings;
}

export const defaultMangapressSettings: MangapressSettings = Object.freeze({
  deviceProfile: 'KV',
  quiet: false,
  mangaStyle: false,
  cropping: 'margins-and-page-numbers',
  croppingPower: 1,
  croppingMinimum: 0,
  preserveMargin: 0,
  splitter: 'split',
  upscale: false,
  stretch: false,
  wallpaper: false,
  whiteBorders: false,
  forcePng: false,
  rotateRight: false,
  autoLevel: false,
  noAutoContrast: false,
  interPanelCrop: 'disabled',
  eraseRainbow: false,
  metadataTitle: 'series-only',
  keepComicInfo: false,
  language: 'en-US',
});
