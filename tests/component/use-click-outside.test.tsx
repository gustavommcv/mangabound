import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useClickOutside } from '@/renderer/hooks/use-click-outside';

function Harness({
  active,
  onOutside,
  children,
}: {
  readonly active: boolean;
  readonly onOutside: () => void;
  readonly children?: React.ReactNode;
}) {
  const ref = useClickOutside<HTMLDivElement>(active, onOutside);
  return (
    <>
      <div ref={ref}>
        <button type="button">Inside</button>
        {children}
      </div>
      <button type="button">Outside</button>
    </>
  );
}

function ToggleableHarness() {
  const [active, setActive] = useState(true);
  const [firedCount, setFiredCount] = useState(0);
  return (
    <Harness
      active={active}
      onOutside={() => {
        setFiredCount((count) => count + 1);
      }}
    >
      <p>Fired: {firedCount}</p>
      <button
        type="button"
        onClick={() => {
          setActive(false);
        }}
      >
        Deactivate
      </button>
    </Harness>
  );
}

describe('useClickOutside', () => {
  it('calls back when a pointer goes down outside the ref, and not for one inside it', async () => {
    const user = userEvent.setup();
    const onOutside = vi.fn();
    render(<Harness active onOutside={onOutside} />);

    await user.click(screen.getByRole('button', { name: 'Inside' }));
    expect(onOutside).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('does nothing while inactive', async () => {
    const user = userEvent.setup();
    const onOutside = vi.fn();
    render(<Harness active={false} onOutside={onOutside} />);

    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('always calls the latest callback without needing it to be stable across renders', async () => {
    const user = userEvent.setup();
    render(<ToggleableHarness />);

    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.getByText('Fired: 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.getByText('Fired: 1')).toBeInTheDocument();
  });
});
