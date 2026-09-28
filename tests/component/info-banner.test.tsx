import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InfoBanner } from '@/renderer/components/shared/info-banner';

describe('InfoBanner', () => {
  it('renders with role="status" and displays title and message', () => {
    render(
      <InfoBanner
        message="Active from the queue: the series will be produced as a single EPUB."
        title="Single book for the series"
      />,
    );

    const banner = screen.getByRole('status', { name: 'Single book for the series' });
    expect(banner).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Single book for the series' }),
    ).toBeVisible();
    expect(
      screen.getByText('Active from the queue: the series will be produced as a single EPUB.'),
    ).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders message without heading when title is omitted', () => {
    render(
      <InfoBanner
        aria-label="Library notice"
        message="Each title in the library will be produced as its own single-series EPUB."
      />,
    );

    const banner = screen.getByRole('status', { name: 'Library notice' });
    expect(banner).toBeVisible();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(
      screen.getByText('Each title in the library will be produced as its own single-series EPUB.'),
    ).toBeVisible();
  });
});
