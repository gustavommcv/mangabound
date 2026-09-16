import type { Meta, StoryObj } from '@storybook/react-vite';

import { createMappingDraft } from '@/domain/mapping';

import { MappingEditor } from './mapping-editor';

const chapters = [
  {
    id: 'chapter-1',
    name: 'Chapter 1 — The Long Way Home',
    path: 'Chapter 001.cbz',
    pageCount: 24,
    chapter: 1,
  },
  {
    id: 'chapter-2',
    name: 'Chapter 2 — A Door Left Open',
    path: 'Chapter 002.cbz',
    pageCount: 22,
    chapter: 2,
  },
  {
    id: 'chapter-3',
    name: 'Chapter 3 — The Shape of Rain',
    path: 'Chapter 003.cbz',
    pageCount: 26,
    chapter: 3,
  },
  {
    id: 'chapter-4',
    name: 'Chapter 4 — After the Storm',
    path: 'Chapter 004.cbz',
    pageCount: 25,
    chapter: 4,
  },
] as const;

const meta = {
  title: 'Workflows/Mapping editor',
  component: MappingEditor,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground min-h-screen p-8">
        <div className="mx-auto max-w-6xl">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof MappingEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ManualOffline: Story = {
  args: {
    initialDraft: createMappingDraft({
      mangaTitle: 'A Quiet Journey',
      chapters,
    }),
  },
};

export const ProviderSuggested: Story = {
  args: {
    initialDraft: createMappingDraft({
      mangaTitle: 'A Quiet Journey',
      chapters,
      source: { provider: 'MangaDex', id: 'f1c4c2ef-13ad-4a8d-9d72-28b6a4f38d22' },
      volumes: [
        { id: 'volume-1', number: '1', chapterIds: ['chapter-1', 'chapter-2'] },
        { id: 'volume-2', number: '2', chapterIds: ['chapter-3', 'chapter-4'] },
      ],
    }),
  },
};

export const WithMetadataSuggestions: Story = {
  args: {
    initialDraft: createMappingDraft({
      mangaTitle: 'A Quiet Journey',
      chapters,
    }),
    onSearchMetadata: () =>
      Promise.resolve([
        { id: 'work-1', title: 'A Quiet Journey', provider: 'MangaDex' },
        { id: 'work-2', title: 'A Quiet Journey (Omnibus)', provider: 'MangaDex' },
      ]),
    onSuggestVolumes: () =>
      Promise.resolve({
        volumes: [
          { number: '1', chapterNumbers: [1, 2] },
          { number: '2', chapterNumbers: [3, 4] },
        ],
      }),
  },
};

export const NeedsAttention: Story = {
  args: {
    initialDraft: createMappingDraft({
      mangaTitle: 'Filename Conflict',
      chapters: [
        {
          ...chapters[0],
          name: 'Volume 2 Chapter 1',
          parsedVolume: 2,
        },
        chapters[1],
      ],
      volumes: [{ id: 'volume-1', number: '1', chapterIds: ['chapter-1'] }],
    }),
  },
};
