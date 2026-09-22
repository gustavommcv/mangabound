import type { Meta, StoryObj } from '@storybook/react-vite';

import { SharePanel } from './share-panel';

const interfaces = [
  { name: 'Wi-Fi', address: '192.168.1.20' },
  { name: 'Ethernet', address: '10.0.0.5' },
];

const meta = {
  title: 'Workflows/Share panel',
  component: SharePanel,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground min-h-screen p-8">
        <div className="mx-auto max-w-2xl">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof SharePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoLibraryChosen: Story = {
  args: {
    interfaces,
    status: { active: false },
    onChooseLibrary: () => undefined,
    onStart: () => undefined,
    onStop: () => undefined,
  },
};

export const ReadyToStart: Story = {
  args: {
    interfaces,
    library: { libraryId: 'library', displayPath: 'C:\\Books' },
    status: { active: false },
    onChooseLibrary: () => undefined,
    onStart: () => undefined,
    onStop: () => undefined,
  },
};

export const Sharing: Story = {
  args: {
    interfaces,
    library: { libraryId: 'library', displayPath: 'C:\\Books' },
    status: {
      active: true,
      url: 'http://192.168.1.20:8080',
      interfaceAddress: '192.168.1.20',
      port: 8080,
    },
    onChooseLibrary: () => undefined,
    onStart: () => undefined,
    onStop: () => undefined,
  },
};

export const NoInterfacesDetected: Story = {
  args: {
    interfaces: [],
    library: { libraryId: 'library', displayPath: 'C:\\Books' },
    status: { active: false },
    onChooseLibrary: () => undefined,
    onStart: () => undefined,
    onStop: () => undefined,
  },
};
