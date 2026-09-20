import type { Meta, StoryObj } from '@storybook/react-vite';

import { Notices } from './notices';

const meta = {
  title: 'Workflows/Notices',
  component: Notices,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground min-h-screen px-8 py-10">
        <div className="mx-auto max-w-6xl">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: { onDismiss: () => undefined },
} satisfies Meta<typeof Notices>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SavedSettingsCouldNotBeUsed: Story = {
  args: {
    notices: [
      'The saved settings could not be read, so the defaults are in use.',
      'The output folder D:\\Manga\\Library is not available. Choose another to save to.',
      'The device profile KV is not available, so Kindle Scribe 1/2 is selected.',
    ],
  },
};
