import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { BookFormat } from '@/domain/conversion';
import { defaultMangapressSettings, type MangapressSettings } from '@/domain/output-profile';
import { MangapressSettingsEditor } from '@/renderer/components/settings/mangapress-settings';

const profiles = [
  {
    code: 'KV',
    name: 'Kindle Voyage',
    width: 1072,
    height: 1448,
    grayLevels: 16,
    family: 'kindle',
  },
  {
    code: 'OTHER',
    name: 'Custom',
    width: 0,
    height: 0,
    grayLevels: 256,
    family: 'other',
  },
] as const;

function StatefulEditor({
  onChange = vi.fn(),
}: {
  readonly onChange?: (value: MangapressSettings) => void;
}) {
  const [settings, setSettings] = useState(defaultMangapressSettings);
  const [format, setFormat] = useState<BookFormat>('epub');
  return (
    <MangapressSettingsEditor
      format={format}
      onFormat={setFormat}
      onSettings={(value) => {
        setSettings(value);
        onChange(value);
      }}
      profiles={profiles}
      settings={settings}
    />
  );
}

describe('mangapress settings editor', () => {
  it('exposes every user-facing mangapress capability in organized sections', () => {
    render(<StatefulEditor />);

    for (const heading of [
      'Device & output',
      'Page layout',
      'Image processing',
      'Book metadata',
      'Tool behavior',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeVisible();
    }
    for (const label of [
      'Device profile',
      'Book format',
      'Custom width (optional)',
      'Custom height (optional)',
      'Manga reading order',
      'Double-page spreads',
      'Rotate clockwise',
      'Page cropping',
      'Cropping power',
      'Minimum retained area (%)',
      'Preserved margin (%)',
      'Inter-panel cropping',
      'Upscale small pages',
      'Stretch to fit',
      'Crop to fill',
      'Force white borders',
      'Dithered grayscale PNG',
      'JPEG quality (optional)',
      'Gamma (optional)',
      'Disable auto contrast',
      'Auto-level black point',
      'Reduce rainbow effect',
      'Title',
      'Author',
      'ComicInfo title',
      'EPUB language',
      'Keep ComicInfo.xml',
      'Quiet mode',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('updates values and explains controls disabled by the current choices', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StatefulEditor onChange={onChange} />);

    expect(screen.getByLabelText('Force white borders')).toBeDisabled();
    expect(screen.getByLabelText('Keep ComicInfo.xml')).toBeDisabled();
    // Spreads start both split and rotated, so rotating clockwise is available until they are split.
    expect(screen.getByLabelText('Rotate clockwise')).toBeEnabled();
    await user.selectOptions(screen.getByLabelText('Double-page spreads'), 'split');
    expect(screen.getByLabelText('Rotate clockwise')).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Double-page spreads'), 'rotate');
    await user.click(screen.getByLabelText('Rotate clockwise'));
    await user.selectOptions(screen.getByLabelText('Book format'), 'cbz');
    await user.click(screen.getByLabelText('Keep ComicInfo.xml'));
    await user.click(screen.getByLabelText('Dithered grayscale PNG'));

    expect(screen.getByLabelText('Rotate clockwise')).toBeChecked();
    expect(screen.getByLabelText('Keep ComicInfo.xml')).toBeChecked();
    expect(screen.getByLabelText('JPEG quality (optional)')).toBeDisabled();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ forcePng: true, keepComicInfo: true, rotateRight: true }),
    );
  });

  it('starts with the options Kindle Comic Converter has on, and the rest off', () => {
    render(<StatefulEditor />);

    expect(screen.getByLabelText('Manga reading order')).toBeChecked();
    expect(screen.getByLabelText('Double-page spreads')).toHaveValue('both');
    expect(screen.getByLabelText('Upscale small pages')).toBeChecked();
    expect(screen.getByLabelText('Page cropping')).toHaveValue('margins-and-page-numbers');
    for (const label of [
      'Stretch to fit',
      'Crop to fill',
      'Dithered grayscale PNG',
      'Disable auto contrast',
      'Auto-level black point',
      'Reduce rainbow effect',
      'Quiet mode',
    ]) {
      expect(screen.getByLabelText(label)).not.toBeChecked();
    }
  });

  it('puts upscaling back to the new device’s own default when the device changes', async () => {
    const user = userEvent.setup();
    render(<StatefulEditor />);

    // The custom profile starts without upscaling, a Kindle Voyage with it.
    await user.selectOptions(screen.getByLabelText('Device profile'), 'OTHER');
    expect(screen.getByLabelText('Upscale small pages')).not.toBeChecked();
    await user.selectOptions(screen.getByLabelText('Device profile'), 'KV');
    expect(screen.getByLabelText('Upscale small pages')).toBeChecked();

    // A choice made by hand lasts until the device changes again, as in KCC.
    await user.click(screen.getByLabelText('Upscale small pages'));
    expect(screen.getByLabelText('Upscale small pages')).not.toBeChecked();
    await user.selectOptions(screen.getByLabelText('Device profile'), 'OTHER');
    await user.selectOptions(screen.getByLabelText('Device profile'), 'KV');
    expect(screen.getByLabelText('Upscale small pages')).toBeChecked();
  });

  it('shows actionable validation beside a custom profile missing dimensions', async () => {
    const user = userEvent.setup();
    render(<StatefulEditor />);

    await user.selectOptions(screen.getByLabelText('Device profile'), 'OTHER');

    expect(
      screen.getByText('The custom device profile needs both a width and height.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Custom width (optional)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });
});
