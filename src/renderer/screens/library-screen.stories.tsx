import type { Meta, StoryObj } from '@storybook/react-vite';

import type { LibraryTitle } from '@/domain/input-queue';
import { createMappingDraft } from '@/domain/mapping';

import { LibraryScreen } from './library-screen';

const chapters = [
  { id: 'c1', name: 'Chapter 1', path: '/m/1', pageCount: 24, chapter: 1 },
  { id: 'c2', name: 'Chapter 2', path: '/m/2', pageCount: 22, chapter: 2 },
  { id: 'c3', name: 'Chapter 3', path: '/m/3', pageCount: 26, chapter: 3 },
] as const;

const grouped = createMappingDraft({
  mangaTitle: 'Chainsaw Man',
  chapters,
  volumes: [{ id: 'v1', number: '1', chapterIds: ['c1', 'c2', 'c3'] }],
});
const partly = createMappingDraft({
  mangaTitle: 'Vagabond',
  chapters,
  volumes: [{ id: 'v1', number: '1', chapterIds: ['c1', 'c2'] }],
});
const loose = createMappingDraft({ mangaTitle: 'Random scans', chapters });

const titles: readonly LibraryTitle[] = [
  {
    title: 'Chainsaw Man',
    draft: grouped,
    volumes: [{ name: 'Chainsaw Man - Vol.01.cbz', pageCount: 72 }],
  },
  {
    title: 'Vagabond',
    draft: partly,
    volumes: [{ name: 'Vagabond - Vol.01.cbz', pageCount: 46 }],
  },
  { title: 'Random scans', draft: loose, volumes: [] },
  {
    title: 'Berserk',
    draft: grouped,
    volumes: [{ name: 'Berserk - Vol.01.cbz', pageCount: 72 }],
    outcome: { status: 'done' },
  },
  {
    title: 'Monster',
    draft: grouped,
    volumes: [{ name: 'Monster - Vol.01.cbz', pageCount: 72 }],
    outcome: { status: 'failed', message: 'mangapress crashed while processing pages.' },
  },
];

const meta = {
  title: 'Workflows/Library titles',
  component: LibraryScreen,
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
  args: { name: 'Manga Library', onBack: () => undefined, onEdit: () => undefined, titles },
} satisfies Meta<typeof LibraryScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EveryState: Story = {};

export const AllReady: Story = {
  args: { titles: titles.slice(0, 2) },
};
