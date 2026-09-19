import type { Meta, StoryObj } from '@storybook/react-vite';

import { KoreaderCard } from '@/renderer/components/sharing/koreader-card';

import { ResultsScreen, type ResultsScreenProps } from './results-screen';

const saved: ResultsScreenProps['outcomes'] = [
  {
    rowId: 'a',
    name: 'Chainsaw Man',
    status: 'done',
    artifacts: [
      { id: 'one', name: 'Chainsaw Man - Vol.01.epub', bytes: 18_400_000, format: 'epub' },
      { id: 'two', name: 'Chainsaw Man - Vol.02.epub', bytes: 17_900_000, format: 'epub' },
    ],
  },
  {
    rowId: 'c',
    name: 'Vagabond Vol.03.cbz',
    status: 'done',
    artifacts: [{ id: 'three', name: 'Vagabond Vol.03.epub', bytes: 22_100_000, format: 'epub' }],
  },
];

const skipped: ResultsScreenProps['outcomes'][number] = {
  rowId: 'b',
  name: 'Random scans',
  status: 'skipped',
  artifacts: [],
  message: 'No volumes yet. Open Edit volumes to group the chapters.',
  fixable: true,
};

const meta = {
  title: 'Workflows/Results',
  component: ResultsScreen,
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
  args: {
    onBack: () => undefined,
    onFix: () => undefined,
    onOpen: () => undefined,
    onShow: () => undefined,
    outcomes: saved,
    summary: 'Kobo Libra Colour · EPUB · D:\\Manga\\Library',
  },
} satisfies Meta<typeof ResultsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

const networks = [{ name: 'Wi-Fi', address: '192.168.1.24' }];

export const Saved: Story = {
  args: {
    aside: (
      <KoreaderCard
        interfaces={networks}
        onStart={() => undefined}
        onStop={() => undefined}
        status={{ active: false }}
      />
    ),
  },
};

export const SavedAndSharing: Story = {
  args: {
    aside: (
      <KoreaderCard
        interfaces={networks}
        onStart={() => undefined}
        onStop={() => undefined}
        status={{
          active: true,
          url: 'http://192.168.1.24:8080/opds',
          interfaceAddress: '192.168.1.24',
          port: 8080,
          authMode: 'token',
          token: 'a1b2c3d4e5f6',
        }}
      />
    ),
  },
};

export const SavedWithSomethingSkipped: Story = {
  args: { outcomes: [...saved, skipped] },
};

export const NothingSaved: Story = {
  args: {
    outcomes: [
      skipped,
      {
        rowId: 'x',
        name: 'Late Bloomer',
        status: 'failed',
        artifacts: [],
        message: 'mangapress crashed while processing pages.',
      },
    ],
  },
};

export const NoNetworkToShareOn: Story = {
  args: {
    aside: (
      <KoreaderCard
        interfaces={[]}
        onStart={() => undefined}
        onStop={() => undefined}
        status={{ active: false }}
      />
    ),
  },
};
