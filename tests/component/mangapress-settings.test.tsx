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
  singleBook,
}: {
  readonly onChange?: (value: MangapressSettings) => void;
  readonly onNotify?: (message: string) => void;
  readonly singleBook?: boolean;
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
      singleBook={singleBook}
    />
  );
}

describe('mangapress settings editor', () => {
  it('shows meaningful placeholders only where a blank value is allowed', () => {
    render(<StatefulEditor />);

    expect(screen.getByLabelText('Custom width (optional)')).toHaveAttribute('placeholder', '1272');
    expect(screen.getByLabelText('Custom height (optional)')).toHaveAttribute(
      'placeholder',
      '1696',
    );
    expect(screen.getByLabelText('JPEG quality (optional)')).toHaveAttribute('placeholder', '85%');
    expect(screen.getByLabelText('Gamma (optional)')).toHaveAttribute('placeholder', '1.0');
    expect(screen.getByLabelText('EPUB language')).not.toHaveAttribute('placeholder');
  });

  it('updates effective hints when the selected device changes', async () => {
    const user = userEvent.setup();
    render(<StatefulEditor />);

    await user.selectOptions(screen.getByLabelText('Device profile'), 'KS');
    expect(screen.getByLabelText('Custom width (optional)')).toHaveAttribute('placeholder', '1860');
    expect(screen.getByLabelText('Custom height (optional)')).toHaveAttribute(
      'placeholder',
      '2480',
    );
    expect(screen.getByLabelText('JPEG quality (optional)')).toHaveAttribute('placeholder', '90%');

    await user.selectOptions(screen.getByLabelText('Device profile'), 'OTHER');
    expect(screen.getByLabelText('Custom width (optional)')).toHaveAttribute(
      'placeholder',
      'Enter width',
    );
    expect(screen.getByLabelText('Custom height (optional)')).toHaveAttribute(
      'placeholder',
      'Enter height',
    );
    expect(screen.getByLabelText('JPEG quality (optional)')).toHaveAttribute('placeholder', '85%');
  });

  it('exposes every user-facing mangapress capability in organized sections', () => {
    render(<StatefulEditor />);

    for (const heading of [
      'Device & output',
      'Reading',
      'Double-page spreads',
      'Size and borders',
      'Cropping',
      'Two-page view',
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
      'Content',
      'Manga reading order',
      'Wide pages',
      'Whole spread first',
      'Keep the whole spread upright',
      'Rotate clockwise',
      'Restack 4-panel strips as 2×2',
      'Page size',
      'Borders',
      'Page cropping',
      'Cropping power',
      'Minimum retained area (%)',
      'Preserved margin (%)',
      'Inter-panel cropping',
      'Start on the other side',
      'One page in landscape',
      'Invert page turns',
      'Dithered grayscale PNG',
      'JPEG quality (optional)',
      'Gamma (optional)',
      'Disable auto contrast',
      'Auto-level black point',
      'Reduce rainbow effect',
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

    expect(screen.getByLabelText('Keep ComicInfo.xml')).toBeDisabled();
    // Spreads start both split and whole, so everything about the whole copy is available.
    for (const label of [
      'Whole spread first',
      'Keep the whole spread upright',
      'Rotate clockwise',
    ]) {
      expect(screen.getByLabelText(label)).toBeEnabled();
    }
    await user.selectOptions(screen.getByLabelText('Wide pages'), 'split');
    for (const label of [
      'Whole spread first',
      'Keep the whole spread upright',
      'Rotate clockwise',
    ]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
    expect(screen.getByText('Only when both versions are made.')).toBeVisible();
    expect(screen.getAllByText('Only when the whole spread is kept.')).toHaveLength(2);

    await user.selectOptions(screen.getByLabelText('Wide pages'), 'rotate');
    expect(screen.getByLabelText('Whole spread first')).toBeDisabled();
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

  it('has nothing to rotate while the whole spread stays upright', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StatefulEditor onChange={onChange} />);

    await user.click(screen.getByLabelText('Whole spread first'));
    await user.click(screen.getByLabelText('Keep the whole spread upright'));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ noRotate: true, rotateFirst: true, splitter: 'both' }),
    );
    expect(screen.getByLabelText('Rotate clockwise')).toBeDisabled();
    expect(
      screen.getByText('Nothing is rotated while the whole spread stays upright.'),
    ).toBeVisible();
  });

  it('replaces the handling of wide pages when strips are restacked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StatefulEditor onChange={onChange} />);

    await user.click(screen.getByLabelText('Restack 4-panel strips as 2×2'));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ maximizeStrips: true }));
    for (const label of [
      'Wide pages',
      'Whole spread first',
      'Keep the whole spread upright',
      'Rotate clockwise',
    ]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
    expect(screen.getAllByText('Replaced by restacking strips.')).toHaveLength(4);
    // What was chosen is kept for when the strips are turned off again.
    expect(screen.getByLabelText('Wide pages')).toHaveValue('both');
  });

  it('locks what webtoon strips never use, and leaves cropping between panels', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StatefulEditor onChange={onChange} />);
    expect(screen.getByText('Each image is one page.')).toBeVisible();

    await user.selectOptions(screen.getByLabelText('Content'), 'webtoon');

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ mangaStyle: true, webtoon: true }),
    );
    expect(
      screen.getByText('Each chapter is joined into one strip and cut into pages between panels.'),
    ).toBeVisible();
    for (const label of [
      'Manga reading order',
      'Wide pages',
      'Whole spread first',
      'Keep the whole spread upright',
      'Rotate clockwise',
      'Restack 4-panel strips as 2×2',
      'Borders',
      'Page cropping',
      'Cropping power',
      'Minimum retained area (%)',
      'Preserved margin (%)',
      'Disable auto contrast',
      'Auto-level black point',
    ]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
    expect(screen.getByText('Always white for webtoon strips.')).toBeVisible();
    expect(screen.getByText('Webtoon strips are never enlarged.')).toBeVisible();
    expect(screen.getByLabelText('Inter-panel cropping')).toBeEnabled();
    expect(screen.getByLabelText('Page size')).toBeEnabled();
    // The choice made for pages is still there when the content is pages again.
    expect(screen.getByLabelText('Manga reading order')).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Restore default for Content' }));
    expect(screen.getByLabelText('Content')).toHaveValue('pages');
    expect(screen.getByLabelText('Manga reading order')).toBeEnabled();
    expect(screen.getByLabelText('Page cropping')).toBeEnabled();
  });

  it('offers one page size and one border choice, each sent as the flag it stands for', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StatefulEditor onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Page size'), 'fill');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ stretch: false, upscale: false, wallpaper: true }),
    );
    expect(screen.getByText('Pages are cropped until they fill the whole screen.')).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Page size'), 'stretch');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ stretch: true, upscale: false, wallpaper: false }),
    );
    await user.click(screen.getByRole('button', { name: 'Restore default for Page size' }));
    expect(screen.getByLabelText('Page size')).toHaveValue('enlarge');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ stretch: false, upscale: true, wallpaper: false }),
    );

    expect(screen.getByText('Each page gets the background its own edges have.')).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Borders'), 'black');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ blackBorders: true, whiteBorders: false }),
    );
    await user.selectOptions(screen.getByLabelText('Borders'), 'white');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ blackBorders: false, whiteBorders: true }),
    );
    expect(
      screen.getByText('A white background behind every page, dark ones included.'),
    ).toBeVisible();
    // The same choice means padding, or none, for the formats that have no page background.
    await user.selectOptions(screen.getByLabelText('Book format'), 'cbz');
    expect(screen.getByText('Pages are not padded with their background color.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Restore default for Borders' }));
    expect(screen.getByLabelText('Borders')).toHaveValue('automatic');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ blackBorders: false, whiteBorders: false }),
    );
  });

  it('offers the two-page view only for an EPUB', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StatefulEditor onChange={onChange} />);
    const twoPageView = ['Start on the other side', 'One page in landscape', 'Invert page turns'];

    for (const label of twoPageView) await user.click(screen.getByLabelText(label));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ invertDirection: true, onePageLandscape: true, spreadShift: true }),
    );

    await user.selectOptions(screen.getByLabelText('Book format'), 'pdf');
    for (const label of twoPageView) expect(screen.getByLabelText(label)).toBeDisabled();
    expect(screen.getAllByText('Only an EPUB carries these.')).toHaveLength(3);
  });

  it('starts with the options Kindle Comic Converter has on, and the rest off', () => {
    render(<StatefulEditor />);

    expect(screen.getByLabelText('Content')).toHaveValue('pages');
    expect(screen.getByLabelText('Manga reading order')).toBeChecked();
    expect(screen.getByLabelText('Wide pages')).toHaveValue('both');
    expect(screen.getByLabelText('Page size')).toHaveValue('enlarge');
    expect(screen.getByLabelText('Borders')).toHaveValue('automatic');
    expect(screen.getByLabelText('Page cropping')).toHaveValue('margins-and-page-numbers');
    for (const label of [
      'Whole spread first',
      'Keep the whole spread upright',
      'Rotate clockwise',
      'Restack 4-panel strips as 2×2',
      'Start on the other side',
      'One page in landscape',
      'Invert page turns',
      'Dithered grayscale PNG',
      'Disable auto contrast',
      'Auto-level black point',
      'Reduce rainbow effect',
      'Quiet mode',
    ]) {
      expect(screen.getByLabelText(label)).not.toBeChecked();
    }
  });

  it('puts enlarging back to the new device’s own default when the device changes', async () => {
    const user = userEvent.setup();
    render(<StatefulEditor />);

    // The custom profile starts without enlarging, a Kindle Voyage with it.
    await user.selectOptions(screen.getByLabelText('Device profile'), 'OTHER');
    expect(screen.getByLabelText('Page size')).toHaveValue('fit');
    await user.selectOptions(screen.getByLabelText('Device profile'), 'KV');
    expect(screen.getByLabelText('Page size')).toHaveValue('enlarge');

    // A choice made by hand lasts until the device changes again, as in KCC.
    await user.selectOptions(screen.getByLabelText('Page size'), 'fit');
    expect(screen.getByLabelText('Page size')).toHaveValue('fit');
    await user.selectOptions(screen.getByLabelText('Device profile'), 'OTHER');
    await user.selectOptions(screen.getByLabelText('Device profile'), 'KV');
    expect(screen.getByLabelText('Page size')).toHaveValue('enlarge');

    // Stretching and cropping to fill are not what a device decides, so they stay.
    await user.selectOptions(screen.getByLabelText('Page size'), 'stretch');
    await user.selectOptions(screen.getByLabelText('Device profile'), 'OTHER');
    expect(screen.getByLabelText('Page size')).toHaveValue('stretch');
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

  it('rules out CBZ and PDF and disables format selection when singleBook is active', () => {
    const { rerender } = render(<StatefulEditor singleBook={false} />);

    const cbzOption: HTMLOptionElement = screen.getByRole('option', { name: 'CBZ' });
    const pdfOption: HTMLOptionElement = screen.getByRole('option', { name: 'PDF' });
    expect(cbzOption.disabled).toBe(false);
    expect(pdfOption.disabled).toBe(false);
    expect(screen.getByLabelText('Book format')).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    rerender(<StatefulEditor singleBook={true} />);

    expect(cbzOption.disabled).toBe(true);
    expect(pdfOption.disabled).toBe(true);
    expect(screen.getByLabelText('Book format')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Single book for the series');
    expect(
      screen.getByText('Turn off “Create one book for the series” to change this.'),
    ).toBeVisible();
  });

  it('marks changed fields and restores only the chosen select, toggle, text, or number', async () => {
    const user = userEvent.setup();
    render(<StatefulEditor />);
    expect(screen.queryByRole('button', { name: /^Restore default for/u })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Book format'), 'cbz');
    await user.selectOptions(screen.getByLabelText('Wide pages'), 'rotate');
    await user.click(screen.getByLabelText('Manga reading order'));
    await user.type(screen.getByLabelText('Gamma (optional)'), '1.2');
    await user.clear(screen.getByLabelText('EPUB language'));
    await user.type(screen.getByLabelText('EPUB language'), 'pt-br');

    for (const label of [
      'Book format',
      'Wide pages',
      'Manga reading order',
      'Gamma',
      'EPUB language',
    ]) {
      expect(screen.getByRole('button', { name: `Restore default for ${label}` })).toBeVisible();
    }
    expect(screen.getByText('Wide pages')).toHaveClass('text-accent');

    await user.click(screen.getByRole('button', { name: 'Restore default for Gamma' }));
    expect(screen.getByLabelText('Gamma (optional)')).toHaveDisplayValue('');
    expect(screen.getByLabelText('Gamma (optional)')).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: 'Restore default for Gamma' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Book format')).toHaveValue('cbz');

    await user.click(screen.getByRole('button', { name: 'Restore default for Book format' }));
    await user.click(screen.getByRole('button', { name: 'Restore default for Wide pages' }));
    await user.click(
      screen.getByRole('button', { name: 'Restore default for Manga reading order' }),
    );
    await user.click(screen.getByRole('button', { name: 'Restore default for EPUB language' }));
    expect(screen.getByLabelText('Book format')).toHaveValue('epub');
    expect(screen.getByLabelText('Wide pages')).toHaveValue('both');
    expect(screen.getByLabelText('Manga reading order')).toBeChecked();
    expect(screen.getByLabelText('EPUB language')).toHaveValue('en-US');
    expect(screen.queryByRole('button', { name: /^Restore default for/u })).not.toBeInTheDocument();
  });

  it('uses the selected device’s page-size default and restores a disabled modified field', async () => {
    const user = userEvent.setup();
    render(<StatefulEditor />);

    await user.selectOptions(screen.getByLabelText('Device profile'), 'KS');
    expect(screen.getByLabelText('Page size')).toHaveValue('fit');
    expect(
      screen.queryByRole('button', { name: 'Restore default for Page size' }),
    ).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Page size'), 'enlarge');
    await user.click(screen.getByRole('button', { name: 'Restore default for Page size' }));
    expect(screen.getByLabelText('Page size')).toHaveValue('fit');

    await user.type(screen.getByLabelText('JPEG quality (optional)'), '80');
    await user.click(screen.getByLabelText('Dithered grayscale PNG'));
    expect(screen.getByLabelText('JPEG quality (optional)')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Restore default for JPEG quality' }));
    expect(screen.getByLabelText('JPEG quality (optional)')).toHaveDisplayValue('');
    expect(screen.getByLabelText('Dithered grayscale PNG')).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Restore default for Device profile' }));
    expect(screen.getByLabelText('Device profile')).toHaveValue('KPW6');
    expect(screen.getByLabelText('Page size')).toHaveValue('enlarge');
    expect(screen.getByLabelText('Dithered grayscale PNG')).toBeChecked();
  });
});
