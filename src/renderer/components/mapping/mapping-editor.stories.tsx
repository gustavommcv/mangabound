import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';

import { createMappingDraft } from '@/domain/mapping';
import type { MetadataProviderDescriptor } from '@/shared/workflow-contract';

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

const mangaDex: MetadataProviderDescriptor = {
  id: 'mangadex',
  displayName: 'MangaDex',
  homepage: 'https://mangadex.org',
  description: 'Community catalogue of manga, with volume and chapter data',
};

const search = () =>
  Promise.resolve([
    { id: 'work-1', title: 'A Quiet Journey', provider: 'mangadex' },
    { id: 'work-2', title: 'A Quiet Journey (Omnibus)', provider: 'mangadex' },
  ]);
const suggest = () =>
  Promise.resolve({
    volumes: [
      { number: '1', chapterNumbers: [1, 2] },
      { number: '2', chapterNumbers: [3, 4] },
    ],
  });

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

export const PreGrouped: Story = {
  args: {
    startedFrom: 'mangabind',
    initialDraft: createMappingDraft({
      mangaTitle: 'A Quiet Journey',
      chapters,
      volumes: [
        { id: 'effective-volume-1', number: '1', chapterIds: ['chapter-1', 'chapter-2'] },
        { id: 'effective-volume-2', number: '2', chapterIds: ['chapter-3', 'chapter-4'] },
      ],
    }),
  },
};

export const ProviderSuggested: Story = {
  args: {
    metadataProviders: [mangaDex],
    onSearchMetadata: search,
    onSuggestVolumes: suggest,
    initialDraft: createMappingDraft({
      mangaTitle: 'A Quiet Journey',
      chapters,
      source: { provider: 'mangadex', id: 'f1c4c2ef-13ad-4a8d-9d72-28b6a4f38d22' },
      volumes: [
        { id: 'volume-1', number: '1', chapterIds: ['chapter-1', 'chapter-2'] },
        { id: 'volume-2', number: '2', chapterIds: ['chapter-3', 'chapter-4'] },
      ],
    }),
  },
};

/** The online source list is closed and nothing is chosen: nothing has been sent anywhere. */
export const OnlineSourceNoneChosen: Story = {
  args: {
    initialDraft: createMappingDraft({ mangaTitle: 'A Quiet Journey', chapters }),
    metadataProviders: [mangaDex],
    onSearchMetadata: search,
    onSuggestVolumes: suggest,
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('tab', { name: 'Online source' }));
    await within(canvasElement).findByRole('combobox', { name: 'Source' });
  },
};

/** The list of sources, open, before anything is chosen. */
export const OnlineSourceListOpen: Story = {
  args: OnlineSourceNoneChosen.args ?? {},
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'Online source' }));
    await userEvent.click(await canvas.findByRole('combobox', { name: 'Source' }));
    await canvas.findByRole('option', { name: /MangaDex/u });
  },
};

export const WithMetadataSuggestions: Story = {
  args: {
    initialDraft: createMappingDraft({
      mangaTitle: 'A Quiet Journey',
      chapters,
    }),
    metadataProviders: [mangaDex],
    onSearchMetadata: search,
    onSuggestVolumes: suggest,
  },
  // Nothing is chosen or searched until the user does it, so the results only exist after these.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'Online source' }));
    await userEvent.click(await canvas.findByRole('combobox', { name: 'Source' }));
    await userEvent.click(await canvas.findByRole('option', { name: /MangaDex/u }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Search' }));
    await canvas.findAllByRole('button', { name: 'Use these volumes' });
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
