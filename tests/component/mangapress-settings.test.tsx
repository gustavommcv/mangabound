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

    expect(screen.getByLabelText('Rotate clockwise')).toBeDisabled();
    expect(screen.getByLabelText('Force white borders')).toBeDisabled();
    expect(screen.getByLabelText('Keep ComicInfo.xml')).toBeDisabled();

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
