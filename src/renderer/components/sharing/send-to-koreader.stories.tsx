import type { Meta, StoryObj } from '@storybook/react-vite';

import { SendToKoreader } from './send-to-koreader';

const meta = {
  title: 'Workflows/Send to KOReader',
  component: SendToKoreader,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground min-h-screen p-8">
        <div className="max-w-sm">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: {
    onOpen: () => undefined,
    status: { active: false },
  },
} satisfies Meta<typeof SendToKoreader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing is being shared yet. */
export const NotSharing: Story = {};

/** The library is already being served: opens the panel instead of starting over. */
export const AlreadySharing: Story = {
  args: {
    status: {
      active: true,
      url: 'http://192.168.1.42:8080/opds',
      interfaceAddress: '192.168.1.42',
      port: 8080,
    },
  },
};
