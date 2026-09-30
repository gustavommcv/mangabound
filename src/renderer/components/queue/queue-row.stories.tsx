import type { Meta, StoryObj } from '@storybook/react-vite';

import { createMappingDraft } from '@/domain/mapping';

import { QueueRowItem } from './queue-row';

const chapters = [
  { id: 'c1', name: 'Chapter 1', path: '/m/1', pageCount: 24, chapter: 1 },
  { id: 'c2', name: 'Chapter 2', path: '/m/2', pageCount: 22, chapter: 2 },
];

const meta = {
  title: 'Workflows/Queue row',
  component: QueueRowItem,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground min-h-screen p-8">
        <ul className="border-border bg-surface mx-auto max-w-lg space-y-0.5 rounded-xl border p-2">
          <Story />
        </ul>
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: {
    mode: 'bind-and-convert',
    onEdit: () => undefined,
    onEditDetails: () => undefined,
    onRemove: () => undefined,
  },
} satisfies Meta<typeof QueueRowItem>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A folder already grouped into volumes, ready to run. */
export const Grouped: Story = {
  args: {
    row: {
      id: 'a',
      kind: 'folder',
      displayName: 'Chainsaw Man',
      displayPath: 'D:\\Manga\\Chainsaw Man',
      state: 'inspected',
      sessionId: 'session-a',
      mapping: createMappingDraft({
        mangaTitle: 'Chainsaw Man',
        chapters,
        volumes: [{ id: 'v1', number: '1', chapterIds: ['c1', 'c2'] }],
      }),
      confirmed: false,
    },
  },
};

/** A folder with a title and an author typed for it: the details button is colored. */
export const WithDetails: Story = {
  args: {
    row: {
      id: 'a',
      kind: 'folder',
      displayName: 'Chainsaw Man',
      displayPath: 'D:\\Manga\\Chainsaw Man',
      state: 'inspected',
      sessionId: 'session-a',
      mapping: createMappingDraft({
        mangaTitle: 'Chainsaw Man',
        chapters,
        volumes: [{ id: 'v1', number: '1', chapterIds: ['c1', 'c2'] }],
      }),
      confirmed: false,
      details: { title: 'Chainsaw Man', author: 'Fujimoto Tatsuki' },
    },
  },
};

/** Only joining volumes: mangapress makes no book, so there are no details to edit. */
export const JoinOnly: Story = {
  args: {
    mode: 'bind-only',
    row: {
      id: 'a',
      kind: 'folder',
      displayName: 'Chainsaw Man',
      displayPath: 'D:\\Manga\\Chainsaw Man',
      state: 'inspected',
      sessionId: 'session-a',
      mapping: createMappingDraft({
        mangaTitle: 'Chainsaw Man',
        chapters,
        volumes: [{ id: 'v1', number: '1', chapterIds: ['c1', 'c2'] }],
      }),
      confirmed: false,
    },
  },
};

/** A folder mangabind could not group on its own: it needs a look in the editor. */
export const NeedsMapping: Story = {
  args: {
    row: {
      id: 'b',
      kind: 'folder',
      displayName: 'Random scans',
      displayPath: 'D:\\Manga\\Random scans',
      state: 'inspected',
      sessionId: 'session-b',
      mapping: createMappingDraft({ mangaTitle: 'Random scans', chapters }),
      confirmed: false,
    },
  },
};

/** A loose .cbz: already one complete volume, nothing to edit. */
export const Cbz: Story = {
  args: {
    row: {
      id: 'c',
      kind: 'cbz',
      displayName: 'Vagabond Vol.03.cbz',
      displayPath: 'D:\\Manga\\Vagabond Vol.03.cbz',
      state: 'inspected',
      sessionId: 'session-c',
      confirmed: false,
    },
  },
};

/** Just added: mangabind has not reported back on it yet. */
export const Inspecting: Story = {
  args: {
    row: {
      id: 'd',
      kind: 'folder',
      displayName: 'New download',
      displayPath: 'D:\\Manga\\New download',
      state: 'inspecting',
    },
  },
};

/** Could not be read at all: nothing about it can run. */
export const Unreadable: Story = {
  args: {
    row: {
      id: 'e',
      kind: 'cbz',
      displayName: 'Broken.cbz',
      displayPath: 'D:\\Manga\\Broken.cbz',
      state: 'unreadable',
      message: 'The file could not be read.',
    },
  },
};

/** Converting only: volumes are already made, so there is nothing here to edit. */
export const ConvertOnlyMode: Story = {
  args: { mode: 'convert-only', row: Grouped.args?.row },
};
