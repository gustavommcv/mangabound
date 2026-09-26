import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, within } from 'storybook/test';

import { DropTarget } from './drop-target';

const meta = {
  title: 'Workflows/Drop target',
  component: DropTarget,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground min-h-screen p-8">
        <div className="mx-auto max-w-xl">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: {
    disabled: false,
    empty: true,
    onAddFiles: () => undefined,
    onAddFolders: () => undefined,
    onDropFiles: () => undefined,
  },
} satisfies Meta<typeof DropTarget>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing queued yet: the whole area is the invitation to add something. */
export const Empty: Story = {};

/** A run is in progress: nothing more can be added until it finishes. */
export const EmptyDisabled: Story = { args: { disabled: true } };

/** Items are already queued: only the line under them answers the pointer. */
export const WithItems: Story = {
  args: {
    empty: false,
    children: (
      <p className="text-muted-foreground px-1 py-2 text-sm">Chainsaw Man, Vagabond, Monster</p>
    ),
  },
};

/**
 * Clicking the empty area opens the choice between files and a folder. The menu itself renders in
 * a portal outside the story's own canvas element (Radix's `DropdownMenuContent`), so it is found
 * through `screen` rather than `within(canvasElement)`.
 */
export const MenuOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByTestId('drop-target'));
    await expect(screen.getByRole('menuitem', { name: 'Choose files' })).toBeVisible();
    await expect(screen.getByRole('menuitem', { name: 'Choose a folder' })).toBeVisible();
  },
};
