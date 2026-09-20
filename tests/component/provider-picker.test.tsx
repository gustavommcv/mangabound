import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ProviderPicker } from '@/renderer/components/mapping/provider-picker';
import { TabList } from '@/renderer/components/ui/tabs';

const providers = [
  {
    id: 'first',
    displayName: 'First Source',
    homepage: 'https://first.example',
    description: 'The first catalogue',
  },
  {
    id: 'second',
    displayName: 'Second Source',
    homepage: 'https://second.example',
    description: 'The second catalogue',
  },
] as const;

function Stateful({
  onSelect = vi.fn(),
}: {
  readonly onSelect?: (id: string | undefined) => void;
}) {
  const [selected, setSelected] = useState<string>();
  return (
    <>
      <ProviderPicker
        onSelect={(id) => {
          setSelected(id);
          onSelect(id);
        }}
        providers={providers}
        selectedId={selected}
      />
      <button type="button">After</button>
    </>
  );
}

const field = (): HTMLElement => screen.getByRole('combobox', { name: 'Source' });

describe('ProviderPicker', () => {
  it('starts closed with nothing chosen, and opens on a click, showing every source', async () => {
    const user = userEvent.setup();
    render(<Stateful />);

    expect(field()).toHaveTextContent('Select a source');
    expect(field()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(field());

    expect(field()).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('listbox', { name: 'Source' });
    expect(within(list).getAllByRole('option')).toHaveLength(3);
    expect(within(list).getByText('first.example · The first catalogue')).toBeVisible();
    // The first entry, "no source", is the one in force until another is chosen.
    expect(within(list).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('chooses a source with a click, closes, and shows its name', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Stateful onSelect={onSelect} />);

    await user.click(field());
    await user.click(screen.getByRole('option', { name: /Second Source/u }));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('second');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(field()).toHaveTextContent('Second Source');
    // Choosing "no source" puts the placeholder back.
    await user.click(field());
    await user.click(screen.getByRole('option', { name: /No online source/u }));
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
    expect(field()).toHaveTextContent('Select a source');
  });

  it('closes on a second click of the field, and when a click lands outside it', async () => {
    const user = userEvent.setup();
    render(<Stateful />);

    await user.click(field());
    await user.click(field());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(field());
    await user.click(screen.getByRole('button', { name: 'After' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('keeps a click inside the list from closing it before the choice is made', async () => {
    const user = userEvent.setup();
    render(<Stateful />);
    await user.click(field());

    await user.hover(screen.getByRole('option', { name: /First Source/u }));

    expect(screen.getByRole('listbox')).toBeVisible();
    expect(field()).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: /First Source/u }).id,
    );
  });

  describe('with the keyboard', () => {
    it.each(['{ArrowDown}', '{ArrowUp}', '{Enter}', ' '])('opens the list with %s', async (key) => {
      const user = userEvent.setup();
      render(<Stateful />);
      field().focus();

      await user.keyboard(key);

      expect(screen.getByRole('listbox')).toBeVisible();
    });

    it('moves through the options, stopping at the ends, and chooses with Enter', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<Stateful onSelect={onSelect} />);
      field().focus();
      await user.keyboard('{ArrowDown}');

      const options = (): HTMLElement[] =>
        within(screen.getByRole('listbox')).getAllByRole('option');
      expect(field()).toHaveAttribute('aria-activedescendant', options()[0]?.id);
      await user.keyboard('{ArrowUp}');
      expect(field()).toHaveAttribute('aria-activedescendant', options()[0]?.id);
      await user.keyboard('{ArrowDown}{ArrowDown}');
      expect(field()).toHaveAttribute('aria-activedescendant', options()[2]?.id);
      await user.keyboard('{ArrowDown}');
      expect(field()).toHaveAttribute('aria-activedescendant', options()[2]?.id);
      await user.keyboard('{Home}');
      expect(field()).toHaveAttribute('aria-activedescendant', options()[0]?.id);
      await user.keyboard('{End}');
      expect(field()).toHaveAttribute('aria-activedescendant', options()[2]?.id);
      await user.keyboard('{Enter}');

      expect(onSelect).toHaveBeenCalledExactlyOnceWith('second');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(field()).toHaveFocus();
    });

    it('chooses with Space too, and opens on the source that is already chosen', async () => {
      const user = userEvent.setup();
      render(<Stateful />);
      field().focus();
      await user.keyboard('{ArrowDown}{ArrowDown} ');
      expect(field()).toHaveTextContent('First Source');

      await user.keyboard('{ArrowDown}');
      const options = within(screen.getByRole('listbox')).getAllByRole('option');
      expect(field()).toHaveAttribute('aria-activedescendant', options[1]?.id);
      expect(options[1]).toHaveAttribute('aria-selected', 'true');
    });

    it('closes with Escape without choosing, and lets Tab leave while closing the list', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<Stateful onSelect={onSelect} />);
      field().focus();

      await user.keyboard('{ArrowDown}{ArrowDown}{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(onSelect).not.toHaveBeenCalled();

      await user.keyboard('{ArrowDown}');
      await user.tab();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    });

    it('ignores keys that mean nothing to it, open or closed', async () => {
      const user = userEvent.setup();
      render(<Stateful />);
      field().focus();

      await user.keyboard('x');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      await user.keyboard('{ArrowDown}x');
      expect(screen.getByRole('listbox')).toBeVisible();
    });
  });

  it('shows the address as it is when it is not a valid one', async () => {
    const user = userEvent.setup();
    render(
      <ProviderPicker
        onSelect={vi.fn()}
        providers={[
          { id: 'odd', displayName: 'Odd', homepage: 'not a url', description: 'Odd one' },
        ]}
        selectedId={undefined}
      />,
    );

    await user.click(field());

    expect(screen.getByText('not a url · Odd one')).toBeVisible();
  });

  it('takes another label for the field', () => {
    render(
      <ProviderPicker
        label="Lookup"
        onSelect={vi.fn()}
        providers={providers}
        selectedId={undefined}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Lookup' })).toBeVisible();
  });
});

describe('TabList', () => {
  const tabs = [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' },
  ] as const;

  it('marks one tab selected, which is the one that can be reached with Tab', () => {
    render(<TabList group="g" label="Letters" onChange={vi.fn()} tabs={tabs} value="b" />);

    expect(screen.getByRole('tablist', { name: 'Letters' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute(
      'aria-controls',
      'g-panel-a',
    );
  });

  it('reports a click, and ignores keys that mean nothing to it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TabList group="g" label="Letters" onChange={onChange} tabs={tabs} value="a" />);

    await user.click(screen.getByRole('tab', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('b');

    onChange.mockClear();
    screen.getByRole('tab', { name: 'Alpha' }).focus();
    await user.keyboard('x');
    expect(onChange).not.toHaveBeenCalled();
  });
});
