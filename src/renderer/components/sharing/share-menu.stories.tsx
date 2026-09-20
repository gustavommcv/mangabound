import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { ShareMenu } from './share-menu';
import { SharePanel } from './share-panel';

const interfaces = [
  { name: 'Wi-Fi', address: '192.168.1.20' },
  { name: 'Ethernet', address: '10.0.0.5' },
];

const sharing = {
  active: true as const,
  url: 'http://192.168.1.20:8080/opds',
  interfaceAddress: '192.168.1.20',
  port: 8080,
  authMode: 'token' as const,
  token: 'a1b2c3d4e5f6',
};

function Menu({ active }: { readonly active: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <ShareMenu onOpenChange={setOpen} open={open} sharing={active}>
      <SharePanel
        interfaces={interfaces}
        library={{ libraryId: 'library', displayPath: 'D:\\Manga\\Library' }}
        onChooseLibrary={() => undefined}
        onStart={() => undefined}
        onStop={() => undefined}
        status={active ? sharing : { active: false }}
      />
    </ShareMenu>
  );
}

const meta = {
  title: 'Workflows/Share menu',
  component: Menu,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground min-h-screen p-4">
        <div className="flex justify-end">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: { active: false },
} satisfies Meta<typeof Menu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing is shared and the panel is put away: only the button shows. */
export const Closed: Story = {};

/** Sharing is on and the panel is put away: the button says so without opening anything. */
export const ClosedWhileSharing: Story = { args: { active: true } };

export const OpenToSetUp: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Share' }));
    await expect(within(canvasElement).getByRole('dialog')).toBeVisible();
  },
};

export const OpenWhileSharing: Story = {
  args: { active: true },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Sharing' }));
    await expect(within(canvasElement).getByRole('dialog')).toBeVisible();
  },
};
