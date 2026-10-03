import type { ReactNode } from 'react';

import type { BookFormat } from '@/domain/conversion';
import {
  type BorderMode,
  borderModeOf,
  defaultJpegQualityFor,
  defaultPageSizeFor,
  defaultValueForSetting,
  type MangapressSettingField,
  type MangapressSettings,
  pageLayoutLocks,
  type PageSizeMode,
  pageSizeOf,
  restoreSettingDefault,
  validateMangapressSettings,
  withBorderMode,
  withDeviceProfile,
  withPageSize,
} from '@/domain/output-profile';
import { defaultFormat } from '@/domain/preferences';
import { singleBookLockReason } from '@/domain/process-mode';
import { SettingFieldHeader } from '@/renderer/components/settings/setting-field-header';
import { FieldMessage } from '@/renderer/components/shared/field-message';
import { InfoBanner } from '@/renderer/components/shared/info-banner';
import { Checkbox } from '@/renderer/components/ui/checkbox';
import { Input } from '@/renderer/components/ui/input';
import { NativeSelect } from '@/renderer/components/ui/native-select';
import type { DeviceProfileSummary } from '@/shared/workflow-contract';

const splitterDescriptions: Readonly<Record<MangapressSettings['splitter'], string>> = {
  split: 'Each half becomes a page of its own.',
  rotate: 'The spread is turned on its side to fill the screen.',
  both: 'The two halves, then the whole spread again.',
};

const pageSizeDescriptions: Readonly<Record<PageSizeMode, string>> = {
  fit: 'Larger pages are shrunk to fit; smaller ones are left as they are.',
  enlarge: 'Every page is fitted to the screen, smaller ones enlarged.',
  stretch: 'Pages fill the screen exactly, without keeping their proportions.',
  fill: 'Pages are cropped until they fill the whole screen.',
};

/** What the border choice does depends on the format: an EPUB has a page background, the others padding. */
const borderDescriptions: Readonly<
  Record<'epub' | 'padded', Readonly<Record<BorderMode, string>>>
> = {
  epub: {
    automatic: 'Each page gets the background its own edges have.',
    white: 'A white background behind every page, dark ones included.',
    black: 'A black background behind every page.',
  },
  padded: {
    automatic: 'Pages are padded to the screen with their own background color.',
    white: 'Pages are not padded with their background color.',
    black: 'Pages are padded to the screen with black.',
  },
};

interface MangapressSettingsProps {
  readonly format: BookFormat;
  readonly onFormat: (format: BookFormat) => void;
  /** A short message shown to the person, the same mechanism used for saved-setting fallbacks. */
  readonly onNotify?: (message: string) => void;
  readonly onSettings: (settings: MangapressSettings) => void;
  readonly profiles: readonly DeviceProfileSummary[];
  readonly settings: MangapressSettings;
  readonly singleBook?: boolean;
}

export function MangapressSettingsEditor({
  format,
  onFormat,
  onSettings,
  profiles,
  settings,
  singleBook,
}: MangapressSettingsProps): React.JSX.Element {
  const singleBookActive = Boolean(singleBook);
  const issues = validateMangapressSettings(settings, format);
  const errorFor = (field: MangapressSettingField): string | undefined =>
    issues.find((issue) => issue.field === field)?.message;
  const selectedProfile = profiles.find((candidate) => candidate.code === settings.deviceProfile);
  const jpegQualityDefault = defaultJpegQualityFor(settings.deviceProfile);
  const update = <K extends keyof MangapressSettings>(
    field: K,
    value: MangapressSettings[K],
  ): void => {
    onSettings({ ...settings, [field]: value });
  };
  const resetProps = (
    field: keyof MangapressSettings,
  ): {
    readonly changed: boolean;
    readonly onReset: () => void;
  } => ({
    changed: settings[field] !== defaultValueForSetting(settings, field),
    onReset: () => {
      onSettings(restoreSettingDefault(settings, field));
    },
  });
  const locks = pageLayoutLocks(settings, format);
  const pageSize = pageSizeOf(settings);
  const borders = borderModeOf(settings);
  // The three numbers tune margin cropping, so they follow it: off by choice, or off for webtoons.
  const croppingReason =
    locks.marginCropping ??
    (settings.cropping === 'disabled' ? 'Enable page cropping to adjust this.' : undefined);
  const croppingDisabled = croppingReason !== undefined;
  const autolevelReason =
    locks.autoContrast ??
    (settings.noAutoContrast ? 'Enable auto contrast to use black-point leveling.' : undefined);

  return (
    <div className="space-y-5">
      {singleBookActive && (
        <InfoBanner
          message="Active from the queue: the series will be produced as a single EPUB with volumes and chapters in the table of contents. Book format and process steps are locked."
          title="Single book for the series"
        />
      )}
      <SettingsSection
        description="Choose the reader target, book format, and optional resolution overrides."
        eyebrow="Basic"
        title="Device & output"
      >
        <SelectField
          {...resetProps('deviceProfile')}
          description={
            selectedProfile === undefined
              ? undefined
              : `${String(selectedProfile.width)} × ${String(selectedProfile.height)} · ${String(selectedProfile.grayLevels)} gray levels`
          }
          error={errorFor('deviceProfile')}
          id="device-profile"
          label="Device profile"
        >
          <NativeSelect
            aria-describedby="device-profile-message"
            aria-invalid={errorFor('deviceProfile') === undefined ? undefined : true}
            disabled={profiles.length === 0}
            id="device-profile"
            onChange={(event) => {
              onSettings(withDeviceProfile(settings, event.target.value));
            }}
            value={settings.deviceProfile}
          >
            {profiles.length === 0 && <option value="">Profiles unavailable</option>}
            {profiles.map((candidate) => (
              <option key={candidate.code} value={candidate.code}>
                {candidate.name} ({candidate.code})
              </option>
            ))}
          </NativeSelect>
        </SelectField>
        <SelectField
          changed={format !== defaultFormat}
          description={singleBookActive ? singleBookLockReason : undefined}
          disabled={singleBookActive}
          id="output-format"
          label="Book format"
          onReset={() => {
            if (!singleBookActive) {
              onFormat(defaultFormat);
            }
          }}
        >
          <NativeSelect
            disabled={singleBookActive}
            id="output-format"
            onChange={(event) => {
              onFormat(event.target.value as BookFormat);
            }}
            value={format}
          >
            <option value="epub">EPUB</option>
            <option disabled={singleBookActive} value="cbz">
              CBZ
            </option>
            <option disabled={singleBookActive} value="pdf">
              PDF
            </option>
          </NativeSelect>
        </SelectField>
        <NumberField
          {...resetProps('customWidth')}
          description="Overrides the profile width. Required with height for the OTHER profile."
          error={errorFor('customWidth')}
          id="custom-width"
          label="Custom width"
          min={1}
          placeholder={
            selectedProfile !== undefined && selectedProfile.width > 0
              ? String(selectedProfile.width)
              : 'Enter width'
          }
          onValue={(value) => {
            update('customWidth', value);
          }}
          optional
          value={settings.customWidth}
        />
        <NumberField
          {...resetProps('customHeight')}
          description="Overrides the profile height. Required with width for the OTHER profile."
          error={errorFor('customHeight')}
          id="custom-height"
          label="Custom height"
          min={1}
          placeholder={
            selectedProfile !== undefined && selectedProfile.height > 0
              ? String(selectedProfile.height)
              : 'Enter height'
          }
          onValue={(value) => {
            update('customHeight', value);
          }}
          optional
          value={settings.customHeight}
        />
      </SettingsSection>

      <SettingsSection
        description="What the images are and which way they are read."
        eyebrow="Basic"
        title="Reading"
      >
        <SelectField
          {...resetProps('webtoon')}
          description={
            settings.webtoon
              ? 'Each chapter is joined into one strip and cut into pages between panels.'
              : 'Each image is one page.'
          }
          id="content"
          label="Content"
        >
          <NativeSelect
            aria-describedby="content-message"
            id="content"
            onChange={(event) => {
              update('webtoon', event.target.value === 'webtoon');
            }}
            value={settings.webtoon ? 'webtoon' : 'pages'}
          >
            <option value="pages">Manga or comic pages</option>
            <option value="webtoon">Webtoon strips</option>
          </NativeSelect>
        </SelectField>
        <ToggleField
          {...resetProps('mangaStyle')}
          checked={settings.mangaStyle}
          description={locks.mangaStyle ?? 'Use right-to-left reading and spread-split order.'}
          disabled={locks.mangaStyle !== undefined}
          id="manga-style"
          label="Manga reading order"
          onChecked={(checked) => {
            update('mangaStyle', checked);
          }}
        />
      </SettingsSection>

      <SettingsSection
        description="What becomes of a page that is two pages wide."
        eyebrow="Advanced"
        title="Double-page spreads"
      >
        <SelectField
          {...resetProps('splitter')}
          description={locks.splitter ?? splitterDescriptions[settings.splitter]}
          disabled={locks.splitter !== undefined}
          id="splitter"
          label="Wide pages"
        >
          <NativeSelect
            aria-describedby="splitter-message"
            disabled={locks.splitter !== undefined}
            id="splitter"
            onChange={(event) => {
              update('splitter', event.target.value as MangapressSettings['splitter']);
            }}
            value={settings.splitter}
          >
            <option value="split">Split into two pages</option>
            <option value="rotate">Keep whole, as one page</option>
            <option value="both">Both: the halves, then the whole</option>
          </NativeSelect>
        </SelectField>
        <ToggleField
          {...resetProps('rotateFirst')}
          checked={settings.rotateFirst}
          description={locks.rotateFirst ?? 'Put the whole spread before its two halves.'}
          disabled={locks.rotateFirst !== undefined}
          id="rotate-first"
          label="Whole spread first"
          onChecked={(checked) => {
            update('rotateFirst', checked);
          }}
        />
        <ToggleField
          {...resetProps('noRotate')}
          checked={settings.noRotate}
          description={
            locks.noRotate ?? 'Not turned on its side: read it with the device in landscape.'
          }
          disabled={locks.noRotate !== undefined}
          id="no-rotate"
          label="Keep the whole spread upright"
          onChecked={(checked) => {
            update('noRotate', checked);
          }}
        />
        <ToggleField
          {...resetProps('rotateRight')}
          checked={settings.rotateRight}
          description={
            locks.rotateRight ?? 'Rotate spreads clockwise instead of counter-clockwise.'
          }
          disabled={locks.rotateRight !== undefined}
          id="rotate-right"
          label="Rotate clockwise"
          onChecked={(checked) => {
            update('rotateRight', checked);
          }}
        />
        <ToggleField
          {...resetProps('maximizeStrips')}
          checked={settings.maximizeStrips}
          description={
            locks.maximizeStrips ??
            'Stack the two halves of every page, for pages made of two tall strips. Replaces the handling of wide pages.'
          }
          disabled={locks.maximizeStrips !== undefined}
          id="maximize-strips"
          label="Restack 4-panel strips as 2×2"
          onChecked={(checked) => {
            update('maximizeStrips', checked);
          }}
        />
      </SettingsSection>

      <SettingsSection
        description="How a page fills the screen and what surrounds it."
        eyebrow="Advanced"
        title="Size and borders"
      >
        <SelectField
          changed={pageSize !== defaultPageSizeFor(settings.deviceProfile)}
          description={
            settings.webtoon && pageSize === 'enlarge'
              ? 'Webtoon strips are never enlarged.'
              : pageSizeDescriptions[pageSize]
          }
          id="page-size"
          label="Page size"
          onReset={() => {
            onSettings(withPageSize(settings, defaultPageSizeFor(settings.deviceProfile)));
          }}
        >
          <NativeSelect
            aria-describedby="page-size-message"
            id="page-size"
            onChange={(event) => {
              onSettings(withPageSize(settings, event.target.value as PageSizeMode));
            }}
            value={pageSize}
          >
            <option value="fit">Fit, never enlarge</option>
            <option value="enlarge">Fit, enlarging small pages</option>
            <option value="stretch">Stretch to the screen</option>
            <option value="fill">Crop to fill the screen</option>
          </NativeSelect>
        </SelectField>
        <SelectField
          changed={borders !== 'automatic'}
          description={
            locks.borders ?? borderDescriptions[format === 'epub' ? 'epub' : 'padded'][borders]
          }
          disabled={locks.borders !== undefined}
          id="borders"
          label="Borders"
          onReset={() => {
            onSettings(withBorderMode(settings, 'automatic'));
          }}
        >
          <NativeSelect
            aria-describedby="borders-message"
            disabled={locks.borders !== undefined}
            id="borders"
            onChange={(event) => {
              onSettings(withBorderMode(settings, event.target.value as BorderMode));
            }}
            value={borders}
          >
            <option value="automatic">Automatic</option>
            <option value="white">White</option>
            <option value="black">Black</option>
          </NativeSelect>
        </SelectField>
      </SettingsSection>

      <SettingsSection
        description="Remove the margins around a page and the empty space between its panels."
        eyebrow="Advanced"
        title="Cropping"
      >
        <SelectField
          {...resetProps('cropping')}
          description={locks.marginCropping}
          disabled={locks.marginCropping !== undefined}
          id="cropping"
          label="Page cropping"
        >
          <NativeSelect
            aria-describedby="cropping-message"
            disabled={locks.marginCropping !== undefined}
            id="cropping"
            onChange={(event) => {
              update('cropping', event.target.value as MangapressSettings['cropping']);
            }}
            value={settings.cropping}
          >
            <option value="disabled">Disabled</option>
            <option value="margins">Margins</option>
            <option value="margins-and-page-numbers">Margins and page numbers</option>
          </NativeSelect>
        </SelectField>
        <NumberField
          {...resetProps('croppingPower')}
          description={croppingReason ?? 'Higher values crop through more.'}
          disabled={croppingDisabled}
          error={errorFor('croppingPower')}
          id="cropping-power"
          label="Cropping power"
          onValue={(value) => {
            if (value !== undefined) update('croppingPower', value);
          }}
          step={0.1}
          value={settings.croppingPower}
        />
        <NumberField
          {...resetProps('croppingMinimum')}
          description={croppingReason ?? 'Only crop when this percentage of the page remains.'}
          disabled={croppingDisabled}
          error={errorFor('croppingMinimum')}
          id="cropping-minimum"
          label="Minimum retained area (%)"
          max={100}
          min={0}
          onValue={(value) => {
            if (value !== undefined) update('croppingMinimum', value);
          }}
          step={0.1}
          value={settings.croppingMinimum}
        />
        <NumberField
          {...resetProps('preserveMargin')}
          description={croppingReason ?? 'Back off the computed crop to retain some margin.'}
          disabled={croppingDisabled}
          error={errorFor('preserveMargin')}
          id="preserve-margin"
          label="Preserved margin (%)"
          max={100}
          min={0}
          onValue={(value) => {
            if (value !== undefined) update('preserveMargin', value);
          }}
          step={0.1}
          value={settings.preserveMargin}
        />
        <SelectField
          {...resetProps('interPanelCrop')}
          description="Removes empty gutters inside webtoon-style pages."
          id="inter-panel-crop"
          label="Inter-panel cropping"
        >
          <NativeSelect
            aria-describedby="inter-panel-crop-message"
            id="inter-panel-crop"
            onChange={(event) => {
              update('interPanelCrop', event.target.value as MangapressSettings['interPanelCrop']);
            }}
            value={settings.interPanelCrop}
          >
            <option value="disabled">Disabled</option>
            <option value="horizontal">Horizontal gaps</option>
            <option value="both">Horizontal and vertical gaps</option>
          </NativeSelect>
        </SelectField>
      </SettingsSection>

      <SettingsSection
        description="For readers that show two pages side by side, such as Kobo's and Kindle's own. KOReader ignores these."
        eyebrow="Advanced"
        title="Two-page view"
      >
        <ToggleField
          {...resetProps('spreadShift')}
          checked={settings.spreadShift}
          description={
            locks.twoPageView ?? 'Start the book on the other side, to line double-page spreads up.'
          }
          disabled={locks.twoPageView !== undefined}
          id="spread-shift"
          label="Start on the other side"
          onChecked={(checked) => {
            update('spreadShift', checked);
          }}
        />
        <ToggleField
          {...resetProps('onePageLandscape')}
          checked={settings.onePageLandscape}
          description={locks.twoPageView ?? 'Show a single centered page instead of two.'}
          disabled={locks.twoPageView !== undefined}
          id="one-page-landscape"
          label="One page in landscape"
          onChecked={(checked) => {
            update('onePageLandscape', checked);
          }}
        />
        <ToggleField
          {...resetProps('invertDirection')}
          checked={settings.invertDirection}
          description={locks.twoPageView ?? 'Turn pages against the reading order.'}
          disabled={locks.twoPageView !== undefined}
          id="invert-direction"
          label="Invert page turns"
          onChecked={(checked) => {
            update('invertDirection', checked);
          }}
        />
      </SettingsSection>

      <SettingsSection
        description="Tune encoding, tone correction, and color e-ink processing."
        eyebrow="Advanced"
        title="Image processing"
      >
        <ToggleField
          {...resetProps('forcePng')}
          checked={settings.forcePng}
          description="Quantize to the device grayscale palette and save PNG pages."
          id="force-png"
          label="Dithered grayscale PNG"
          onChecked={(checked) => {
            update('forcePng', checked);
          }}
        />
        <NumberField
          {...resetProps('jpegQuality')}
          description={
            settings.forcePng
              ? 'Not used while grayscale PNG output is enabled.'
              : `Leave empty for the device profile default (${String(jpegQualityDefault)}%).`
          }
          disabled={settings.forcePng}
          error={errorFor('jpegQuality')}
          id="jpeg-quality"
          label="JPEG quality"
          max={100}
          min={1}
          placeholder={`${String(jpegQualityDefault)}%`}
          onValue={(value) => {
            update('jpegQuality', value);
          }}
          optional
          value={settings.jpegQuality}
        />
        <NumberField
          {...resetProps('gamma')}
          description="Leave empty for profile gamma; 1.0 leaves tones unchanged."
          error={errorFor('gamma')}
          id="gamma"
          label="Gamma"
          placeholder="1.0"
          onValue={(value) => {
            update('gamma', value);
          }}
          optional
          step={0.1}
          value={settings.gamma}
        />
        <ToggleField
          {...resetProps('noAutoContrast')}
          checked={settings.noAutoContrast}
          description={locks.autoContrast ?? 'Skip automatic contrast adjustment.'}
          disabled={locks.autoContrast !== undefined}
          id="no-auto-contrast"
          label="Disable auto contrast"
          onChecked={(checked) => {
            update('noAutoContrast', checked);
          }}
        />
        <ToggleField
          {...resetProps('autoLevel')}
          checked={settings.autoLevel}
          description={
            autolevelReason ?? 'Set the most common dark pixel as the black point first.'
          }
          disabled={autolevelReason !== undefined}
          id="auto-level"
          label="Auto-level black point"
          onChecked={(checked) => {
            update('autoLevel', checked);
          }}
        />
        <ToggleField
          {...resetProps('eraseRainbow')}
          checked={settings.eraseRainbow}
          description="Attenuate rainbow interference on color e-ink displays."
          id="erase-rainbow"
          label="Reduce rainbow effect"
          onChecked={(checked) => {
            update('eraseRainbow', checked);
          }}
        />
      </SettingsSection>

      <SettingsSection
        description="How source metadata is applied, and the language books are made in. A book's own title, author and language are set from its item in the queue."
        eyebrow="Advanced"
        title="Book metadata"
      >
        <SelectField
          {...resetProps('metadataTitle')}
          description="Controls how ComicInfo.xml's Title field is applied."
          id="metadata-title"
          label="ComicInfo title"
        >
          <NativeSelect
            aria-describedby="metadata-title-message"
            id="metadata-title"
            onChange={(event) => {
              update('metadataTitle', event.target.value as MangapressSettings['metadataTitle']);
            }}
            value={settings.metadataTitle}
          >
            <option value="series-only">Use series, volume, and number</option>
            <option value="combine">Append the ComicInfo title</option>
            <option value="title-only">Use the ComicInfo title only</option>
          </NativeSelect>
        </SelectField>
        <TextField
          {...resetProps('language')}
          description={
            format === 'epub'
              ? "Used for EPUB output, unless a book's own details name another language."
              : 'Stored for this profile and applied when EPUB is selected.'
          }
          error={errorFor('language')}
          id="language"
          label="EPUB language"
          onValue={(value) => {
            update('language', value);
          }}
          value={settings.language}
        />
        <ToggleField
          {...resetProps('keepComicInfo')}
          checked={settings.keepComicInfo}
          description={
            format === 'cbz'
              ? 'Copy the original ComicInfo.xml into the converted CBZ.'
              : 'Available only for CBZ output.'
          }
          disabled={format !== 'cbz'}
          id="keep-comic-info"
          label="Keep ComicInfo.xml"
          onChecked={(checked) => {
            update('keepComicInfo', checked);
          }}
        />
      </SettingsSection>

      <SettingsSection
        description="Controls intended for troubleshooting and repeatable profile parity."
        eyebrow="Diagnostics"
        title="Tool behavior"
      >
        <ToggleField
          {...resetProps('quiet')}
          checked={settings.quiet}
          description="The GUI already uses structured events, which suppress routine console chatter; this setting preserves exact --quiet parity in saved profiles."
          id="quiet"
          label="Quiet mode"
          onChecked={(checked) => {
            update('quiet', checked);
          }}
        />
      </SettingsSection>
    </div>
  );
}

function SettingsSection({
  children,
  description,
  eyebrow,
  title,
}: {
  readonly children: ReactNode;
  readonly description: string;
  readonly eyebrow: string;
  readonly title: string;
}): React.JSX.Element {
  return (
    <section className="border-border bg-surface rounded-xl border p-6">
      <div className="mb-5">
        <p className="text-muted-foreground text-xs font-medium">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

interface ResettableFieldProps {
  readonly changed: boolean;
  readonly onReset: () => void;
}

function SelectField({
  changed,
  children,
  description,
  disabled,
  error,
  id,
  label,
  onReset,
}: ResettableFieldProps & {
  readonly children: ReactNode;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly id: string;
  readonly label: string;
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <SettingFieldHeader
        changed={changed}
        disabled={disabled}
        id={id}
        label={label}
        onReset={onReset}
      />
      {children}
      <FieldMessage description={description} error={error} id={`${id}-message`} />
    </div>
  );
}

function TextField({
  changed,
  description,
  error,
  id,
  label,
  onValue,
  onReset,
  placeholder,
  value,
}: ResettableFieldProps & {
  readonly description?: string;
  readonly error?: string;
  readonly id: string;
  readonly label: string;
  readonly onValue: (value: string) => void;
  readonly placeholder?: string;
  readonly value: string;
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <SettingFieldHeader changed={changed} id={id} label={label} onReset={onReset} />
      <Input
        aria-describedby={
          description === undefined && error === undefined ? undefined : `${id}-message`
        }
        aria-invalid={error === undefined ? undefined : true}
        id={id}
        onChange={(event) => {
          onValue(event.target.value);
        }}
        placeholder={placeholder}
        value={value}
      />
      <FieldMessage description={description} error={error} id={`${id}-message`} />
    </div>
  );
}

function NumberField({
  changed,
  description,
  disabled,
  error,
  id,
  label,
  max,
  min,
  onValue,
  onReset,
  optional = false,
  placeholder,
  step = 1,
  value,
}: ResettableFieldProps & {
  readonly description?: string;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly id: string;
  readonly label: string;
  readonly max?: number;
  readonly min?: number;
  readonly onValue: (value: number | undefined) => void;
  readonly optional?: boolean;
  readonly placeholder?: string;
  readonly step?: number;
  readonly value: number | undefined;
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <SettingFieldHeader
        changed={changed}
        id={id}
        label={label}
        onReset={onReset}
        optional={optional}
      />
      <Input
        aria-describedby={
          description === undefined && error === undefined ? undefined : `${id}-message`
        }
        aria-invalid={error === undefined ? undefined : true}
        disabled={disabled}
        id={id}
        max={max}
        min={min}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '') {
            if (optional) onValue(undefined);
            return;
          }
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) onValue(parsed);
        }}
        placeholder={placeholder}
        step={step}
        type="number"
        value={value ?? ''}
      />
      <FieldMessage description={description} error={error} id={`${id}-message`} />
    </div>
  );
}

function ToggleField({
  changed,
  checked,
  description,
  disabled,
  id,
  label,
  onChecked,
  onReset,
}: ResettableFieldProps & {
  readonly checked: boolean;
  readonly description: string;
  readonly disabled?: boolean;
  readonly id: string;
  readonly label: string;
  readonly onChecked: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <div className="flex gap-3">
      <Checkbox
        aria-describedby={`${id}-message`}
        checked={checked}
        disabled={disabled}
        id={id}
        onCheckedChange={(value) => {
          onChecked(value === true);
        }}
      />
      <div className="-mt-0.5 min-w-0 flex-1">
        <SettingFieldHeader
          changed={changed}
          disabled={disabled}
          id={id}
          label={label}
          onReset={onReset}
        />
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed" id={`${id}-message`}>
          {description}
        </p>
      </div>
    </div>
  );
}
