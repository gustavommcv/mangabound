import type { Meta, StoryObj } from '@storybook/react-vite';

import type { QueueRow } from '@/domain/input-queue';
import { createMappingDraft } from '@/domain/mapping';
import { defaultMangapressSettings } from '@/domain/output-profile';

import { QueueScreen, type QueueScreenProps } from './queue-screen';

const chapters = [
  { id: 'c1', name: 'Chapter 1', path: '/m/1', pageCount: 24, chapter: 1 },
  { id: 'c2', name: 'Chapter 2', path: '/m/2', pageCount: 22, chapter: 2 },
  { id: 'c3', name: 'Chapter 3', path: '/m/3', pageCount: 26, chapter: 3 },
] as const;

const grouped = createMappingDraft({
  mangaTitle: 'Chainsaw Man',
  chapters,
  volumes: [
    { id: 'v1', number: '1', chapterIds: ['c1', 'c2'] },
    { id: 'v2', number: '2', chapterIds: ['c3'] },
  ],
});

const rows: readonly QueueRow[] = [
  {
    id: 'a',
    kind: 'folder',
    displayName: 'Chainsaw Man',
    displayPath: 'D:\\Manga\\Chainsaw Man',
    state: 'inspected',
    sessionId: 'session-a',
    mapping: grouped,
    proposedSignature: JSON.stringify({
      title: 'Chainsaw Man',
      source: null,
      volumes: [
        { number: '1', chapterIds: ['c1', 'c2'] },
        { number: '2', chapterIds: ['c3'] },
      ],
    }),
    confirmed: false,
  },
  {
    id: 'b',
    kind: 'folder',
    displayName: 'Random scans',
    displayPath: 'D:\\Manga\\Random scans',
    state: 'inspected',
    sessionId: 'session-b',
    mapping: createMappingDraft({ mangaTitle: 'Random scans', chapters }),
    confirmed: false,
  },
  {
    id: 'c',
    kind: 'cbz',
    displayName: 'Vagabond Vol.03.cbz',
    displayPath: 'D:\\Manga\\Vagabond Vol.03.cbz',
    state: 'inspected',
    sessionId: 'session-c',
    confirmed: false,
  },
  {
    id: 'd',
    kind: 'folder',
    displayName: 'New download',
    displayPath: 'D:\\Manga\\New download',
    state: 'inspecting',
  },
  {
    id: 'e',
    kind: 'cbz',
    displayName: 'Broken.cbz',
    displayPath: 'D:\\Manga\\Broken.cbz',
    state: 'unreadable',
    message: 'The file could not be read.',
  },
];

const libraryTitles = [
  {
    title: 'Chainsaw Man',
    draft: grouped,
    volumes: [
      { name: 'Chainsaw Man - Vol.01.cbz', pageCount: 46 },
      { name: 'Chainsaw Man - Vol.02.cbz', pageCount: 26 },
    ],
  },
  {
    title: 'Vagabond',
    draft: grouped,
    volumes: [{ name: 'Vagabond - Vol.01.cbz', pageCount: 72 }],
  },
  {
    title: 'Random scans',
    draft: createMappingDraft({ mangaTitle: 'Random scans', chapters }),
    volumes: [],
  },
] as const;

const libraryRow: QueueRow = {
  id: 'lib',
  kind: 'library',
  displayName: 'Manga Library',
  displayPath: 'D:\\Manga\\Manga Library',
  state: 'inspected',
  sessionId: 'session-lib',
  confirmed: false,
  titles: libraryTitles,
};

const base: QueueScreenProps = {
  disabled: false,
  format: 'epub',
  library: { libraryId: 'library', displayPath: 'D:\\Manga\\Library' },
  mode: 'bind-and-convert',
  onAddFiles: () => undefined,
  onAddFolders: () => undefined,
  onChooseLibrary: () => undefined,
  onClear: () => undefined,
  onConvert: () => undefined,
  onDeviceProfile: () => undefined,
  onDismissRejected: () => undefined,
  onDropFiles: () => undefined,
  onEdit: () => undefined,
  onFormat: () => undefined,
  onMode: () => undefined,
  onOpenOptions: () => undefined,
  onRemove: () => undefined,
  onReset: () => undefined,
  onValidate: () => undefined,
  profiles: [
    {
      code: 'KPW6',
      name: 'Kindle Paperwhite 6',
      width: 1272,
      height: 1696,
      grayLevels: 16,
      family: 'kindle',
    },
    {
      code: 'KoAO',
      name: 'Kobo Aura ONE',
      width: 1404,
      height: 1872,
      grayLevels: 16,
      family: 'kobo',
    },
  ],
  rejected: [],
  rows: [],
  settings: defaultMangapressSettings,
  validating: false,
};

const meta = {
  title: 'Workflows/Queue',
  component: QueueScreen,
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
  args: base,
} satisfies Meta<typeof QueueScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const WithItems: Story = {
  args: { rows },
};

export const WithLibrary: Story = {
  args: { rows: [libraryRow, ...rows.slice(2, 3)] },
};

export const LibraryNeedsVolumes: Story = {
  args: { rows: [{ ...libraryRow, titles: libraryTitles.slice(2) }] },
};

export const LibraryWhenNotGrouping: Story = {
  args: { rows: [libraryRow], mode: 'convert-only' },
};

export const NoOutputFolderYet: Story = {
  args: { rows: rows.slice(0, 1), library: undefined },
};

export const JoinOnly: Story = {
  args: { rows, mode: 'bind-only' },
};

export const ConvertOnly: Story = {
  args: { rows, mode: 'convert-only' },
};

/** Options that were changed, and kept: the button that puts them back is live. */
export const OptionsChanged: Story = {
  args: {
    rows,
    format: 'pdf',
    settings: { ...defaultMangapressSettings, deviceProfile: 'KoAO', upscale: false },
  },
};

export const OnlyComicFiles: Story = {
  args: { rows: rows.slice(2, 3) },
};

export const SomeItemsNotAdded: Story = {
  args: {
    rows: rows.slice(0, 1),
    rejected: [
      { name: 'notes.txt', reason: 'Only folders and .cbz files can be added.' },
      { name: 'Backups', reason: 'That item could not be read.' },
    ],
  },
};

export const PlanValidated: Story = {
  args: {
    rows: rows.slice(0, 1),
    plans: [
      {
        name: 'Chainsaw Man',
        plan: {
          tool: 'mangabind',
          title: 'Chainsaw Man',
          message: 'mangabind validated 2 volumes · no library files written',
          books: [
            { name: 'Chainsaw Man - Vol.01.cbz', pageCount: 46 },
            { name: 'Chainsaw Man - Vol.02.cbz', pageCount: 26 },
          ],
          issues: [],
        },
      },
    ],
  },
};

export const ToolsNotReady: Story = {
  args: { disabled: true },
};
