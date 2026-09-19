import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ModeInput, ProcessMode } from '@/domain/process-mode';
import { ProcessSteps } from '@/renderer/components/settings/process-steps';

function Harness({
  disabled,
  initial,
  input,
  onMode,
}: {
  readonly disabled?: boolean;
  readonly initial: ProcessMode;
  readonly input: ModeInput;
  readonly onMode?: (mode: ProcessMode) => void;
}): React.JSX.Element {
  const [mode, setMode] = useState(initial);
  return (
    <ProcessSteps
      {...(disabled === undefined ? {} : { disabled })}
      input={input}
      mode={mode}
      onMode={(next) => {
        onMode?.(next);
        setMode(next);
      }}
    />
  );
}

const group = (): HTMLElement =>
  screen.getByRole('checkbox', { name: 'Group chapters into volumes' });
const convert = (): HTMLElement => screen.getByRole('checkbox', { name: 'Convert for e-reader' });

describe('process steps', () => {
  it('starts a folder with both steps on and names the tool behind each', () => {
    render(<Harness initial="bind-and-convert" input="folder" />);

    expect(group()).toBeChecked();
    expect(convert()).toBeChecked();
    expect(group()).toBeEnabled();
    expect(convert()).toBeEnabled();
    expect(group()).toHaveAccessibleDescription('mangabind');
    expect(convert()).toHaveAccessibleDescription('mangapress');
  });

  it('lets a folder turn either step off, and never both, explaining why the last one is locked', async () => {
    const user = userEvent.setup();
    const onMode = vi.fn();
    render(<Harness initial="bind-and-convert" input="folder" onMode={onMode} />);

    await user.click(convert());
    expect(onMode).toHaveBeenLastCalledWith('bind-only');
    expect(convert()).not.toBeChecked();
    // Group is now the only step left: it stays on, and says so.
    expect(group()).toBeChecked();
    expect(group()).toBeDisabled();
    expect(group()).toHaveAccessibleDescription(/Keep at least one step on/u);

    await user.click(convert());
    expect(onMode).toHaveBeenLastCalledWith('bind-and-convert');

    await user.click(group());
    expect(onMode).toHaveBeenLastCalledWith('convert-only');
    expect(convert()).toBeChecked();
    expect(convert()).toBeDisabled();
    expect(convert()).toHaveAccessibleDescription(/Keep at least one step on/u);
  });

  it('keeps a CBZ on the one process it has, with the reason visible', () => {
    render(<Harness initial="bind-only" input="cbz" />);

    // A joined-only choice carried over from a folder settles on the CBZ's only process.
    expect(group()).not.toBeChecked();
    expect(group()).toBeDisabled();
    expect(group()).toHaveAccessibleDescription(/already one volume/u);
    expect(convert()).toBeChecked();
    expect(convert()).toBeDisabled();
    expect(screen.getByText(/already one volume, so there is nothing to join/u)).toBeVisible();
  });

  it('keeps a library grouped, since it is bound title by title', async () => {
    const user = userEvent.setup();
    const onMode = vi.fn();
    render(<Harness initial="bind-and-convert" input="library" onMode={onMode} />);

    expect(group()).toBeChecked();
    expect(group()).toBeDisabled();
    expect(group()).toHaveAccessibleDescription(/title by title/u);

    await user.click(convert());
    expect(onMode).toHaveBeenLastCalledWith('bind-only');
    expect(group()).toHaveAccessibleDescription(/Keep at least one step on/u);
  });

  it('shows a convert-only choice carried over to a library as the ordinary run', () => {
    render(<Harness initial="convert-only" input="library" />);

    expect(group()).toBeChecked();
    expect(convert()).toBeChecked();
  });

  it('can be locked while a run is in progress', () => {
    render(<Harness disabled initial="bind-and-convert" input="folder" />);

    expect(group()).toBeDisabled();
    expect(convert()).toBeDisabled();
  });
});
