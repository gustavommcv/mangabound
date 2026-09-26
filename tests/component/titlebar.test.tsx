import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Titlebar } from '@/renderer/components/shell/titlebar';

describe('Titlebar', () => {
  it('names the app and says it is the desktop app', () => {
    render(<Titlebar desktop />);

    expect(screen.getByText('Mangabound')).toBeVisible();
    expect(screen.getByText('Desktop')).toBeVisible();
  });

  it('says it is a foundation preview when there is no desktop shell behind it', () => {
    render(<Titlebar desktop={false} />);

    expect(screen.getByText('Foundation')).toBeVisible();
    expect(screen.queryByText('Desktop')).not.toBeInTheDocument();
  });

  it('shows the running app version when it is known', () => {
    render(<Titlebar desktop version="0.1.0-alpha.1" />);

    expect(screen.getByText('v0.1.0-alpha.1')).toBeVisible();
  });

  it('shows no version label when it is not known', () => {
    render(<Titlebar desktop />);

    expect(screen.queryByText(/^v\d/u)).not.toBeInTheDocument();
  });

  it('holds actions on its right, apart from the part the window is dragged by', () => {
    render(
      <Titlebar desktop>
        <button type="button">An action</button>
      </Titlebar>,
    );

    const action = screen.getByRole('button', { name: 'An action' });
    expect(action.parentElement).toHaveClass('window-titlebar-actions');
  });

  it('has no actions block when it has no actions', () => {
    const { container } = render(<Titlebar desktop />);

    expect(container.querySelector('.window-titlebar-actions')).toBeNull();
  });

  it.each([
    ['darwin', 'pl-20'],
    ['win32', 'pl-4'],
    ['linux', 'pl-4'],
  ])('leaves room on %s for the window buttons where they are (%s)', (platform, inset) => {
    const { container } = render(<Titlebar desktop platform={platform} />);

    expect(container.querySelector('.window-titlebar-content')).toHaveClass(inset);
  });

  it('starts at the normal inset when the platform is not known', () => {
    const { container } = render(<Titlebar desktop />);

    expect(container.querySelector('.window-titlebar-content')).toHaveClass('pl-4');
  });
});
