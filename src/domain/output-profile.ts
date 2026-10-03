import type { BookFormat } from './conversion';

export type CroppingMode = 'disabled' | 'margins' | 'margins-and-page-numbers';
export type SplitterMode = 'split' | 'rotate' | 'both';
export type InterPanelCropMode = 'disabled' | 'horizontal' | 'both';
export type MetadataTitleMode = 'series-only' | 'combine' | 'title-only';

/** How a page fills the screen: one choice, where mangapress has three flags of which one wins. */
export type PageSizeMode = 'fit' | 'enlarge' | 'stretch' | 'fill';
/** What surrounds a page: the color of its own background, or one that is forced. */
export type BorderMode = 'automatic' | 'white' | 'black';

export interface MangapressSettings {
  readonly deviceProfile: string;
  readonly quiet: boolean;
  /** The images are long strips to cut into pages between panels, not pages. */
  readonly webtoon: boolean;
  readonly mangaStyle: boolean;
  readonly cropping: CroppingMode;
  readonly croppingPower: number;
  readonly croppingMinimum: number;
  readonly preserveMargin: number;
  readonly splitter: SplitterMode;
  /** The whole copy of a spread stays upright instead of being turned on its side. */
  readonly noRotate: boolean;
  /** The whole copy of a spread comes before its two halves instead of after. */
  readonly rotateFirst: boolean;
  /** Every page's two halves are stacked (1x4 strips become 2x2); replaces spread handling. */
  readonly maximizeStrips: boolean;
  readonly upscale: boolean;
  readonly stretch: boolean;
  readonly wallpaper: boolean;
  readonly whiteBorders: boolean;
  readonly blackBorders: boolean;
  /** The book starts on the other side of a two-page view. */
  readonly spreadShift: boolean;
  /** A two-page view shows one centered page. */
  readonly onePageLandscape: boolean;
  /** Pages turn against the reading order. */
  readonly invertDirection: boolean;
  readonly forcePng: boolean;
  readonly jpegQuality?: number;
  readonly rotateRight: boolean;
  readonly gamma?: number;
  readonly autoLevel: boolean;
  readonly noAutoContrast: boolean;
  readonly interPanelCrop: InterPanelCropMode;
  readonly eraseRainbow: boolean;
  readonly metadataTitle: MetadataTitleMode;
  readonly keepComicInfo: boolean;
  /** The EPUB language a book gets unless its own details name another (ADR 0030). */
  readonly language: string;
  readonly customWidth?: number;
  readonly customHeight?: number;
  readonly combineIntoOneVolume: boolean;
}

/**
 * The formats "bind the whole series as one volume" is offered for. EPUB only, for now: mangapress
 * can build a nested volume/chapter table of contents in EPUB's own nav, but not yet in PDF (its
 * PDF library's bookmarks are a flat list, not a tree) or CBZ (no chapter-boundary metadata is
 * written into CBZ output at all today). Widening this later, once mangapress supports another
 * format, is exactly one edit: add it here. See docs/adr/0024-combine-into-one-volume-is-epub-only.md.
 */
export const FORMATS_SUPPORTING_COMBINED_VOLUME: ReadonlySet<BookFormat> = new Set(['epub']);

/** Mirrors the pinned mangapress profile default: Scribe/Colorsoft use 90, others 85. */
export function defaultJpegQualityFor(deviceProfile: string): number {
  return deviceProfile.startsWith('KS') || deviceProfile === 'KCS' ? 90 : 85;
}

export type MangapressSettingField = keyof MangapressSettings;

export interface MangapressSettingIssue {
  readonly field: MangapressSettingField;
  readonly message: string;
}

/**
 * The state the settings start in. It is the state Kindle Comic Converter's own window opens in
 * (ADR 0011, ADR 0015), not the state the mangapress command line starts in: a Kindle Paperwhite,
 * manga reading order, spreads both split and rotated, upscaling, and cropping of margins and page
 * numbers are on; everything else is off or automatic. The format stays EPUB, which is the one
 * option that still differs from KCC's window.
 */
export const defaultMangapressSettings: MangapressSettings = Object.freeze({
  deviceProfile: 'KPW6',
  quiet: false,
  webtoon: false,
  mangaStyle: true,
  cropping: 'margins-and-page-numbers',
  croppingPower: 1,
  croppingMinimum: 0,
  preserveMargin: 0,
  splitter: 'both',
  noRotate: false,
  rotateFirst: false,
  maximizeStrips: false,
  upscale: true,
  stretch: false,
  wallpaper: false,
  whiteBorders: false,
  blackBorders: false,
  spreadShift: false,
  onePageLandscape: false,
  invertDirection: false,
  forcePng: false,
  rotateRight: false,
  autoLevel: false,
  noAutoContrast: false,
  interPanelCrop: 'disabled',
  eraseRainbow: false,
  metadataTitle: 'series-only',
  keepComicInfo: false,
  language: 'en-US',
  combineIntoOneVolume: false,
});

/**
 * The device profiles Kindle Comic Converter starts with upscaling off for: older or low
 * resolution readers, the Scribe family, and the custom profile. Every other profile, including
 * one this list has never heard of, starts with it on.
 */
const profilesWithoutUpscaleByDefault: ReadonlySet<string> = new Set([
  'K1',
  'K2',
  'K34',
  'K57',
  'K810',
  'KDX',
  'KPW',
  'KS',
  'KS1240',
  'KS1324',
  'KS1860',
  'KS1920',
  'KS3',
  'KSCS',
  'KoA',
  'KoG',
  'KoGHD',
  'KoMT',
  'OTHER',
]);

export function defaultUpscaleFor(deviceProfile: string): boolean {
  return !profilesWithoutUpscaleByDefault.has(deviceProfile);
}

/**
 * The settings after choosing another device. As in Kindle Comic Converter, the choice also puts
 * upscaling back to what that device starts with, so it is the one setting a device change resets.
 */
export function withDeviceProfile(
  settings: MangapressSettings,
  deviceProfile: string,
): MangapressSettings {
  return { ...settings, deviceProfile, upscale: defaultUpscaleFor(deviceProfile) };
}

/** The current device owns the starting upscale value; all other fields use the app defaults. */
export function defaultValueForSetting<K extends keyof MangapressSettings>(
  settings: MangapressSettings,
  field: K,
): MangapressSettings[K] {
  return (
    field === 'upscale'
      ? defaultUpscaleFor(settings.deviceProfile)
      : defaultMangapressSettings[field]
  ) as MangapressSettings[K];
}

/** Restoring a device follows the same coupled upscale rule as choosing that device normally. */
export function restoreSettingDefault<K extends keyof MangapressSettings>(
  settings: MangapressSettings,
  field: K,
): MangapressSettings {
  if (field === 'deviceProfile') {
    return withDeviceProfile(settings, defaultMangapressSettings.deviceProfile);
  }
  return { ...settings, [field]: defaultValueForSetting(settings, field) };
}

/**
 * The one choice the three size flags amount to. mangapress lets all three be set and then lets
 * one win: cropping to fill over stretching, stretching over enlarging.
 */
export function pageSizeOf(
  settings: Pick<MangapressSettings, 'upscale' | 'stretch' | 'wallpaper'>,
): PageSizeMode {
  if (settings.wallpaper) return 'fill';
  if (settings.stretch) return 'stretch';
  return settings.upscale ? 'enlarge' : 'fit';
}

/** The settings with exactly the flag that choice needs, so the three never disagree. */
export function withPageSize(settings: MangapressSettings, mode: PageSizeMode): MangapressSettings {
  return {
    ...settings,
    upscale: mode === 'enlarge',
    stretch: mode === 'stretch',
    wallpaper: mode === 'fill',
  };
}

/** Where the page size starts for a device: enlarging, or not, as that device starts (ADR 0011). */
export function defaultPageSizeFor(deviceProfile: string): PageSizeMode {
  return defaultUpscaleFor(deviceProfile) ? 'enlarge' : 'fit';
}

/** Black wins when both are set, as it does in mangapress. */
export function borderModeOf(
  settings: Pick<MangapressSettings, 'whiteBorders' | 'blackBorders'>,
): BorderMode {
  if (settings.blackBorders) return 'black';
  return settings.whiteBorders ? 'white' : 'automatic';
}

export function withBorderMode(settings: MangapressSettings, mode: BorderMode): MangapressSettings {
  return { ...settings, whiteBorders: mode === 'white', blackBorders: mode === 'black' };
}

/** The page-layout controls another choice can leave without effect. */
export type PageLayoutControl =
  | 'mangaStyle'
  | 'splitter'
  | 'rotateFirst'
  | 'noRotate'
  | 'rotateRight'
  | 'maximizeStrips'
  | 'borders'
  | 'marginCropping'
  | 'autoContrast'
  | 'twoPageView';

export const webtoonLockReason = 'Not used for webtoon strips.';
export const stripsLockReason = 'Replaced by restacking strips.';

/**
 * Why each page-layout control has no effect with the current choices; a control that is not
 * named can be used. A locked control keeps its value and stays visible (ADR 0005): mangapress
 * ignores it, and it applies again as soon as the choice that locked it is undone.
 *
 * Webtoon strips are never read right to left, split, bordered in anything but white, cropped at
 * the margins or autocontrasted. Restacking strips replaces the handling of wide pages. What is
 * left follows the choice for wide pages: there is a whole copy to place and turn only when one
 * is kept. The three options of a two-page view are written into an EPUB and nowhere else.
 */
export function pageLayoutLocks(
  settings: MangapressSettings,
  format: BookFormat,
): Partial<Record<PageLayoutControl, string>> {
  const locks: Partial<Record<PageLayoutControl, string>> = {};
  if (format !== 'epub') locks.twoPageView = 'Only an EPUB carries these.';
  if (settings.webtoon) {
    for (const control of [
      'mangaStyle',
      'splitter',
      'rotateFirst',
      'noRotate',
      'rotateRight',
      'maximizeStrips',
      'marginCropping',
      'autoContrast',
    ] as const) {
      locks[control] = webtoonLockReason;
    }
    locks.borders = 'Always white for webtoon strips.';
    return locks;
  }
  if (settings.maximizeStrips) {
    for (const control of ['splitter', 'rotateFirst', 'noRotate', 'rotateRight'] as const) {
      locks[control] = stripsLockReason;
    }
    return locks;
  }
  if (settings.splitter !== 'both') locks.rotateFirst = 'Only when both versions are made.';
  if (settings.splitter === 'split') {
    locks.noRotate = 'Only when the whole spread is kept.';
    locks.rotateRight = 'Only when the whole spread is kept.';
  } else if (settings.noRotate) {
    locks.rotateRight = 'Nothing is rotated while the whole spread stays upright.';
  }
  return locks;
}

export interface DeviceProfileOption {
  readonly code: string;
  readonly name: string;
}

/**
 * The device to fall back to when the chosen profile is not in the offered list, whether it came
 * from a saved file or is the default: the default profile if it is offered, otherwise the first
 * one offered. Returns undefined when no fallback is needed, including while the list has not
 * loaded yet (an empty list never triggers a fallback).
 */
export function resolveDeviceProfileFallback(
  deviceProfile: string,
  availableProfiles: readonly DeviceProfileOption[],
): DeviceProfileOption | undefined {
  if (availableProfiles.length === 0) return undefined;
  if (availableProfiles.some((profile) => profile.code === deviceProfile)) return undefined;
  return (
    availableProfiles.find((profile) => profile.code === defaultMangapressSettings.deviceProfile) ??
    availableProfiles[0]
  );
}

export function validateMangapressSettings(
  settings: MangapressSettings,
  format: BookFormat,
): readonly MangapressSettingIssue[] {
  const issues: MangapressSettingIssue[] = [];
  if (settings.deviceProfile.trim() === '') {
    issues.push({ field: 'deviceProfile', message: 'Choose a device profile.' });
  }
  // Belt and suspenders: the settings UI is expected to keep this combination from happening at
  // all (switching to EPUB, or disabling the other formats, the moment the box is checked - see
  // FORMATS_SUPPORTING_COMBINED_VOLUME), but the domain layer doesn't trust the UI alone.
  if (settings.combineIntoOneVolume && !FORMATS_SUPPORTING_COMBINED_VOLUME.has(format)) {
    issues.push({
      field: 'combineIntoOneVolume',
      message: 'Binding the whole series as one volume is only available for EPUB right now.',
    });
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
