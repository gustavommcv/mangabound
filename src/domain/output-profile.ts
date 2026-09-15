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

export type MangapressSettingField = keyof MangapressSettings;

export interface MangapressSettingIssue {
  readonly field: MangapressSettingField;
  readonly message: string;
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

export function validateMangapressSettings(
  settings: MangapressSettings,
): readonly MangapressSettingIssue[] {
  const issues: MangapressSettingIssue[] = [];
  if (settings.deviceProfile.trim() === '') {
    issues.push({ field: 'deviceProfile', message: 'Choose a device profile.' });
  }
  finite(issues, 'croppingPower', settings.croppingPower, 'Cropping power');
  percentage(issues, 'croppingMinimum', settings.croppingMinimum, 'Minimum retained area');
  percentage(issues, 'preserveMargin', settings.preserveMargin, 'Preserved margin');
  if (settings.jpegQuality !== undefined) {
    integerRange(issues, 'jpegQuality', settings.jpegQuality, 1, 100, 'JPEG quality');
  }
  if (settings.gamma !== undefined) finite(issues, 'gamma', settings.gamma, 'Gamma');
  positiveInteger(issues, 'customWidth', settings.customWidth, 'Custom width');
  positiveInteger(issues, 'customHeight', settings.customHeight, 'Custom height');
  if (
    settings.deviceProfile === 'OTHER' &&
    (settings.customWidth === undefined || settings.customHeight === undefined)
  ) {
    issues.push({
      field: settings.customWidth === undefined ? 'customWidth' : 'customHeight',
      message: 'The custom device profile needs both a width and height.',
    });
  }
  if (settings.language.trim() === '') {
    issues.push({ field: 'language', message: 'Enter an EPUB language code.' });
  }
  return issues;
}

function finite(
  issues: MangapressSettingIssue[],
  field: MangapressSettingField,
  value: number,
  label: string,
): void {
  if (!Number.isFinite(value)) issues.push({ field, message: `${label} must be a number.` });
}

function percentage(
  issues: MangapressSettingIssue[],
  field: MangapressSettingField,
  value: number,
  label: string,
): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    issues.push({ field, message: `${label} must be between 0 and 100.` });
  }
}

function integerRange(
  issues: MangapressSettingIssue[],
  field: MangapressSettingField,
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    issues.push({
      field,
      message: `${label} must be a whole number from ${minimum} to ${maximum}.`,
    });
  }
}

function positiveInteger(
  issues: MangapressSettingIssue[],
  field: MangapressSettingField,
  value: number | undefined,
  label: string,
): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
    issues.push({ field, message: `${label} must be a positive whole number.` });
  }
}
