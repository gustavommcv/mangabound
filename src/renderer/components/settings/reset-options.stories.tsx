import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { ResetOptions } from './reset-options';

const meta = {
  title: 'Workflows/Reset options',
  component: ResetOptions,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground min-h-screen p-8">
        <div className="border-border bg-surface mx-auto max-w-sm rounded-xl border p-6">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: {
    changed: true,
    onReset: () => undefined,
    scope: 'the steps, device, format and every mangapress option',
  },
} satisfies Meta<typeof ResetOptions>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Something differs from the defaults, so the button is live. */
export const Available: Story = {};

/** Nothing to reset: the button stays where it is, dimmed. */
export const AtTheDefaults: Story = { args: { changed: false } };

/** After the first click, before anything is discarded. */
export const AskingToConfirm: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Reset to defaults' }));
    await expect(canvas.getByRole('group', { name: 'Confirm reset' })).toBeVisible();
  },
};
