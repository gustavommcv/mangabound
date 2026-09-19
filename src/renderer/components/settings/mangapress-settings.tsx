import type { ReactNode } from 'react';

import type { BookFormat } from '@/domain/conversion';
import {
  type MangapressSettingField,
  type MangapressSettings,
  validateMangapressSettings,
  withDeviceProfile,
} from '@/domain/output-profile';
import { Checkbox } from '@/renderer/components/ui/checkbox';
import { Input } from '@/renderer/components/ui/input';
import { Label } from '@/renderer/components/ui/label';
import { NativeSelect } from '@/renderer/components/ui/native-select';
import type { DeviceProfileSummary } from '@/shared/workflow-contract';

interface MangapressSettingsProps {
  readonly format: BookFormat;
  readonly onFormat: (format: BookFormat) => void;
  readonly onSettings: (settings: MangapressSettings) => void;
  readonly profiles: readonly DeviceProfileSummary[];
  readonly settings: MangapressSettings;
}

export function MangapressSettingsEditor({
  format,
  onFormat,
  onSettings,
  profiles,
  settings,
}: MangapressSettingsProps): React.JSX.Element {
  const issues = validateMangapressSettings(settings);
  const errorFor = (field: MangapressSettingField): string | undefined =>
    issues.find((issue) => issue.field === field)?.message;
  const selectedProfile = profiles.find((candidate) => candidate.code === settings.deviceProfile);
  const update = <K extends keyof MangapressSettings>(
    field: K,
    value: MangapressSettings[K],
  ): void => {
    onSettings({ ...settings, [field]: value });
  };
  const croppingDisabled = settings.cropping === 'disabled';
  const rotationDisabled = settings.splitter === 'split';
  const autolevelDisabled = settings.noAutoContrast;

  return (
    <div className="space-y-5">
      <SettingsSection
        description="Choose the reader target, book format, and optional resolution overrides."
        eyebrow="Basic"
        title="Device & output"
      >
        <SelectField
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
        <SelectField id="output-format" label="Book format">
          <NativeSelect
            id="output-format"
            onChange={(event) => {
              onFormat(event.target.value as BookFormat);
            }}
            value={format}
          >
            <option value="epub">EPUB</option>
            <option value="cbz">CBZ</option>
            <option value="pdf">PDF</option>
          </NativeSelect>
        </SelectField>
        <NumberField
          description="Overrides the profile width. Required with height for the OTHER profile."
          error={errorFor('customWidth')}
          id="custom-width"
          label="Custom width"
          min={1}
          onValue={(value) => {
            update('customWidth', value);
          }}
          optional
          value={settings.customWidth}
        />
        <NumberField
          description="Overrides the profile height. Required with width for the OTHER profile."
          error={errorFor('customHeight')}
          id="custom-height"
          label="Custom height"
          min={1}
          onValue={(value) => {
            update('customHeight', value);
          }}
          optional
          value={settings.customHeight}
        />
      </SettingsSection>

      <SettingsSection
        description="Control reading order, spread handling, cropping, and fit behavior."
        eyebrow="Advanced"
        title="Page layout"
      >
        <ToggleField
          checked={settings.mangaStyle}
          description="Use right-to-left reading and spread-split order."
          id="manga-style"
          label="Manga reading order"
          onChecked={(checked) => {
            update('mangaStyle', checked);
          }}
        />
        <SelectField id="splitter" label="Double-page spreads">
          <NativeSelect
            id="splitter"
            onChange={(event) => {
              update('splitter', event.target.value as MangapressSettings['splitter']);
            }}
            value={settings.splitter}
          >
            <option value="split">Split into two pages</option>
            <option value="rotate">Rotate as one page</option>
            <option value="both">Create both versions</option>
          </NativeSelect>
        </SelectField>
        <ToggleField
          checked={settings.rotateRight}
          description={
            rotationDisabled
              ? 'Available when spreads are rotated.'
              : 'Rotate spreads clockwise instead of counter-clockwise.'
          }
          disabled={rotationDisabled}
          id="rotate-right"
          label="Rotate clockwise"
          onChecked={(checked) => {
            update('rotateRight', checked);
          }}
        />
        <SelectField id="cropping" label="Page cropping">
          <NativeSelect
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
          description={
            croppingDisabled
              ? 'Enable page cropping to adjust this.'
              : 'Higher values crop through more.'
          }
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
          description={
            croppingDisabled
              ? 'Enable page cropping to adjust this.'
              : 'Only crop when this percentage of the page remains.'
          }
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
          description={
            croppingDisabled
              ? 'Enable page cropping to adjust this.'
              : 'Back off the computed crop to retain some margin.'
          }
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
        <ToggleField
          checked={settings.upscale}
          description={
            settings.wallpaper
              ? 'Crop-to-fill takes precedence over upscaling.'
              : 'Enlarge pages smaller than the target resolution.'
          }
          disabled={settings.wallpaper}
          id="upscale"
          label="Upscale small pages"
          onChecked={(checked) => {
            update('upscale', checked);
          }}
        />
        <ToggleField
          checked={settings.stretch}
          description="Fill the target resolution without preserving aspect ratio."
          id="stretch"
          label="Stretch to fit"
          onChecked={(checked) => {
            update('stretch', checked);
          }}
        />
        <ToggleField
          checked={settings.wallpaper}
          description="Crop pages to fill the entire screen."
          id="wallpaper"
          label="Crop to fill"
          onChecked={(checked) => {
            update('wallpaper', checked);
          }}
        />
        <ToggleField
          checked={settings.whiteBorders}
          description={
            format === 'epub'
              ? 'Available for CBZ and PDF output.'
              : 'Force white borders instead of detected-background padding.'
          }
          disabled={format === 'epub'}
          id="white-borders"
          label="Force white borders"
          onChecked={(checked) => {
            update('whiteBorders', checked);
          }}
        />
      </SettingsSection>

      <SettingsSection
        description="Tune encoding, tone correction, and color e-ink processing."
        eyebrow="Advanced"
        title="Image processing"
      >
        <ToggleField
          checked={settings.forcePng}
          description="Quantize to the device grayscale palette and save PNG pages."
          id="force-png"
          label="Dithered grayscale PNG"
          onChecked={(checked) => {
            update('forcePng', checked);
          }}
        />
        <NumberField
          description={
            settings.forcePng
              ? 'Not used while grayscale PNG output is enabled.'
              : 'Leave empty for the device profile default.'
          }
          disabled={settings.forcePng}
          error={errorFor('jpegQuality')}
          id="jpeg-quality"
          label="JPEG quality"
          max={100}
          min={1}
          onValue={(value) => {
            update('jpegQuality', value);
          }}
          optional
          value={settings.jpegQuality}
        />
        <NumberField
          description="Leave empty for profile gamma; 1.0 leaves tones unchanged."
          error={errorFor('gamma')}
          id="gamma"
          label="Gamma"
          onValue={(value) => {
            update('gamma', value);
          }}
          optional
          step={0.1}
          value={settings.gamma}
        />
        <ToggleField
          checked={settings.noAutoContrast}
          description="Skip automatic contrast adjustment."
          id="no-auto-contrast"
          label="Disable auto contrast"
          onChecked={(checked) => {
            update('noAutoContrast', checked);
          }}
        />
        <ToggleField
          checked={settings.autoLevel}
          description={
            autolevelDisabled
              ? 'Enable auto contrast to use black-point leveling.'
              : 'Set the most common dark pixel as the black point first.'
          }
          disabled={autolevelDisabled}
          id="auto-level"
          label="Auto-level black point"
          onChecked={(checked) => {
            update('autoLevel', checked);
          }}
        />
        <ToggleField
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
        description="Override book identity and control source metadata handling."
        eyebrow="Advanced"
        title="Book metadata"
      >
        <TextField
          description="Leave empty to derive the title from the input name."
          id="book-title"
          label="Title"
          onValue={(value) => {
            update('title', value === '' ? undefined : value);
          }}
          value={settings.title ?? ''}
        />
        <TextField
          id="book-author"
          label="Author"
          onValue={(value) => {
            update('author', value === '' ? undefined : value);
          }}
          value={settings.author ?? ''}
        />
        <SelectField
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
          description={
            format === 'epub'
              ? 'Used for EPUB output.'
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

function SelectField({
  children,
  description,
  error,
  id,
  label,
}: {
  readonly children: ReactNode;
  readonly description?: string;
  readonly error?: string;
  readonly id: string;
  readonly label: string;
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FieldMessage description={description} error={error} id={`${id}-message`} />
    </div>
  );
}

function TextField({
  description,
  error,
  id,
  label,
  onValue,
  value,
}: {
  readonly description?: string;
  readonly error?: string;
  readonly id: string;
  readonly label: string;
  readonly onValue: (value: string) => void;
  readonly value: string;
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        aria-describedby={
          description === undefined && error === undefined ? undefined : `${id}-message`
        }
        aria-invalid={error === undefined ? undefined : true}
        id={id}
        onChange={(event) => {
          onValue(event.target.value);
        }}
        value={value}
      />
      <FieldMessage description={description} error={error} id={`${id}-message`} />
    </div>
  );
}

function NumberField({
  description,
  disabled,
  error,
  id,
  label,
  max,
  min,
  onValue,
  optional = false,
  step = 1,
  value,
}: {
  readonly description?: string;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly id: string;
  readonly label: string;
  readonly max?: number;
  readonly min?: number;
  readonly onValue: (value: number | undefined) => void;
  readonly optional?: boolean;
  readonly step?: number;
  readonly value: number | undefined;
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {optional && (
          <>
            {' '}
            <span className="text-subtle-foreground font-normal">(optional)</span>
          </>
        )}
      </Label>
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
        step={step}
        type="number"
        value={value ?? ''}
      />
      <FieldMessage description={description} error={error} id={`${id}-message`} />
    </div>
  );
}

function ToggleField({
  checked,
  description,
  disabled,
  id,
  label,
  onChecked,
}: {
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
      <div className="-mt-0.5">
        <Label className={disabled ? 'text-muted-foreground' : undefined} htmlFor={id}>
          {label}
        </Label>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed" id={`${id}-message`}>
          {description}
        </p>
      </div>
    </div>
  );
}

function FieldMessage({
  description,
  error,
  id,
}: {
  readonly description?: string;
  readonly error?: string;
  readonly id?: string;
}): React.JSX.Element | null {
  if (error !== undefined) {
    return (
      <p className="text-status-failed text-xs" id={id}>
        {error}
      </p>
    );
  }
  return description === undefined ? null : (
    <p className="text-muted-foreground text-xs leading-relaxed" id={id}>
      {description}
    </p>
  );
}
