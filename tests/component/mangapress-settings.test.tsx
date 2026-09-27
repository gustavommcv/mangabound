import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { BookFormat } from '@/domain/conversion';
import { defaultMangapressSettings, type MangapressSettings } from '@/domain/output-profile';
import { MangapressSettingsEditor } from '@/renderer/components/settings/mangapress-settings';

const profiles = [
  {
    code: 'KPW6',
    name: 'Kindle Paperwhite 6',
    width: 1272,
    height: 1696,
    grayLevels: 16,
    family: 'kindle',
  },
  {
    code: 'KV',
    name: 'Kindle Voyage',
    width: 1072,
    height: 1448,
    grayLevels: 16,
    family: 'kindle',
  },
  {
    code: 'KS',
    name: 'Kindle Scribe',
    width: 1860,
    height: 2480,
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
  onNotify = vi.fn(),
}: {
  readonly onChange?: (value: MangapressSettings) => void;
  readonly onNotify?: (message: string) => void;
}) {
  const [settings, setSettings] = useState(defaultMangapressSettings);
  const [format, setFormat] = useState<BookFormat>('epub');
  return (
    <MangapressSettingsEditor
      format={format}
      onFormat={setFormat}
      onNotify={onNotify}
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
      'Bind the whole series as one volume',
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

  it('rules out CBZ and PDF while combining into one volume is on', async () => {
    const user = userEvent.setup();
    render(<StatefulEditor />);

    const cbzOption: HTMLOptionElement = screen.getByRole('option', { name: 'CBZ' });
    const pdfOption: HTMLOptionElement = screen.getByRole('option', { name: 'PDF' });
    expect(cbzOption.disabled).toBe(false);
    expect(pdfOption.disabled).toBe(false);

    await user.click(screen.getByLabelText('Bind the whole series as one volume'));

    expect(cbzOption.disabled).toBe(true);
    expect(pdfOption.disabled).toBe(true);
    expect(screen.getByLabelText('Book format')).toHaveValue('epub');
  });

  it('switches away from CBZ or PDF and says why when combining is turned on', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    render(<StatefulEditor onNotify={onNotify} />);

    await user.selectOptions(screen.getByLabelText('Book format'), 'cbz');
    await user.click(screen.getByLabelText('Bind the whole series as one volume'));

    expect(screen.getByLabelText('Book format')).toHaveValue('epub');
    expect(onNotify).toHaveBeenCalledWith(expect.stringContaining('Switched to EPUB'));
  });

  it('marks changed fields and restores only the chosen select, toggle, text, or number', async () => {
    const user = userEvent.setup();
    render(<StatefulEditor />);
    expect(screen.queryByRole('button', { name: /^Restore default for/u })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Book format'), 'cbz');
    await user.selectOptions(screen.getByLabelText('Double-page spreads'), 'rotate');
    await user.click(screen.getByLabelText('Manga reading order'));
    await user.type(screen.getByLabelText('Gamma (optional)'), '1.2');
    await user.type(screen.getByLabelText('Title'), 'A new book');

    for (const label of [
      'Book format',
      'Double-page spreads',
      'Manga reading order',
      'Gamma',
      'Title',
    ]) {
      expect(screen.getByRole('button', { name: `Restore default for ${label}` })).toBeVisible();
    }
    expect(screen.getByText('Double-page spreads')).toHaveClass('text-accent');

    await user.click(screen.getByRole('button', { name: 'Restore default for Gamma' }));
    expect(screen.getByLabelText('Gamma (optional)')).toHaveDisplayValue('');
    expect(screen.getByLabelText('Gamma (optional)')).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: 'Restore default for Gamma' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Book format')).toHaveValue('cbz');

    await user.click(screen.getByRole('button', { name: 'Restore default for Book format' }));
    await user.click(
      screen.getByRole('button', { name: 'Restore default for Double-page spreads' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Restore default for Manga reading order' }),
    );
    await user.click(screen.getByRole('button', { name: 'Restore default for Title' }));
    expect(screen.getByLabelText('Book format')).toHaveValue('epub');
    expect(screen.getByLabelText('Double-page spreads')).toHaveValue('both');
    expect(screen.getByLabelText('Manga reading order')).toBeChecked();
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.queryByRole('button', { name: /^Restore default for/u })).not.toBeInTheDocument();
  });

  it('uses the selected device’s upscale default and restores a disabled modified field', async () => {
    const user = userEvent.setup();
    render(<StatefulEditor />);

    await user.selectOptions(screen.getByLabelText('Device profile'), 'KS');
    expect(screen.getByLabelText('Upscale small pages')).not.toBeChecked();
    expect(
      screen.queryByRole('button', { name: 'Restore default for Upscale small pages' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Upscale small pages'));
    await user.click(
      screen.getByRole('button', { name: 'Restore default for Upscale small pages' }),
    );
    expect(screen.getByLabelText('Upscale small pages')).not.toBeChecked();

    await user.type(screen.getByLabelText('JPEG quality (optional)'), '80');
    await user.click(screen.getByLabelText('Dithered grayscale PNG'));
    expect(screen.getByLabelText('JPEG quality (optional)')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Restore default for JPEG quality' }));
    expect(screen.getByLabelText('JPEG quality (optional)')).toHaveDisplayValue('');
    expect(screen.getByLabelText('Dithered grayscale PNG')).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Restore default for Device profile' }));
    expect(screen.getByLabelText('Device profile')).toHaveValue('KPW6');
    expect(screen.getByLabelText('Upscale small pages')).toBeChecked();
    expect(screen.getByLabelText('Dithered grayscale PNG')).toBeChecked();
  });
});
