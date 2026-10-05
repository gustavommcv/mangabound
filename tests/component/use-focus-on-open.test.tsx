import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { useFocusOnOpen } from '@/renderer/hooks/use-focus-on-open';

function Harness({ startOpen = false }: { readonly startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const question = useFocusOnOpen<HTMLDivElement>(open);
  return (
    <>
      <button
        onClick={() => {
          setOpen((now) => !now);
        }}
        type="button"
      >
        Toggle
      </button>
      <div aria-label="Question" ref={question} role="group" tabIndex={-1}>
        <button type="button">Answer</button>
      </div>
    </>
  );
}

describe('useFocusOnOpen', () => {
  it('moves focus to the element when it opens, and not before', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toggle = screen.getByRole('button', { name: 'Toggle' });
    toggle.focus();
    expect(screen.getByRole('group', { name: 'Question' })).not.toHaveFocus();

    await user.click(toggle);

    expect(screen.getByRole('group', { name: 'Question' })).toHaveFocus();
    // Tab goes on to the first thing inside it.
    await user.tab();
    expect(screen.getByRole('button', { name: 'Answer' })).toHaveFocus();
  });

  it('leaves focus alone when it closes, for the caller to put somewhere', async () => {
    const user = userEvent.setup();
    render(<Harness startOpen />);
    const toggle = screen.getByRole('button', { name: 'Toggle' });
    expect(screen.getByRole('group', { name: 'Question' })).toHaveFocus();

    await user.click(toggle);

    expect(toggle).toHaveFocus();
  });
});
