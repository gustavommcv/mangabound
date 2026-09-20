import type { Meta, StoryObj } from '@storybook/react-vite';

import { ShareMenu } from '@/renderer/components/sharing/share-menu';
import { SharePanel } from '@/renderer/components/sharing/share-panel';

import { Titlebar } from './titlebar';

const meta = {
  title: 'Shell/Title bar',
  component: Titlebar,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground min-h-64">
        <Story />
        <p className="text-muted-foreground px-8 py-10 text-sm">
          The page under the bar scrolls; the bar stays where it is.
        </p>
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: { desktop: true, platform: 'win32' },
} satisfies Meta<typeof Titlebar>;

export default meta;
type Story = StoryObj<typeof meta>;

const panel = (
  <SharePanel
    interfaces={[]}
    onChooseLibrary={() => undefined}
    onStart={() => undefined}
    onStop={() => undefined}
    status={{ active: false }}
  />
);

export const Idle: Story = {
  args: {
    children: (
      <ShareMenu onOpenChange={() => undefined} open={false} sharing={false}>
        {panel}
      </ShareMenu>
    ),
  },
};

export const WhileSharing: Story = {
  args: {
    children: (
      <ShareMenu onOpenChange={() => undefined} open={false} sharing>
        {panel}
      </ShareMenu>
    ),
  },
};

/** The window buttons sit on the left on macOS, so the name starts further in. */
export const OnMacOS: Story = { args: { platform: 'darwin' } };

/** A plain browser preview has no desktop shell behind it. */
export const Foundation: Story = { args: { desktop: false } };
