import type { Meta, StoryObj } from '@storybook/react-vite';

import { defaultMangapressSettings } from '@/domain/output-profile';

import {
  BatchReview,
  Complete,
  ConversionSettings,
  Home,
  Inspecting,
  IssueCallout,
  PlanResult,
  Running,
} from './app';

const frame = (Story: React.ComponentType): React.JSX.Element => (
  <div className="bg-background text-foreground min-h-screen p-10">
    <div className="mx-auto max-w-6xl">
      <Story />
    </div>
  </div>
);

const meta = {
  title: 'Workflows/Single input',
  component: Home,
  decorators: [frame],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Home>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Start: Story = {
  args: { disabled: false, onChoose: () => undefined, onChooseBatch: () => undefined },
};

export const Disabled: Story = {
  args: { disabled: true, onChoose: () => undefined, onChooseBatch: () => undefined },
};

export const Loading: Story = {
  args: { disabled: false, onChoose: () => undefined },
  render: () => (
    <Inspecting
      selection={{
        selectionId: 'selection',
        displayName: 'A Quiet Journey',
        displayPath: '/Manga/A Quiet Journey',
        kind: 'folder',
      }}
    />
  ),
};

export const Settings: Story = {
  args: { disabled: false, onChoose: () => undefined },
  render: () => (
    <ConversionSettings
      format="epub"
      inspection={{
        sessionId: 'session',
        displayName: 'A Quiet Journey',
        kind: 'folder',
        issues: [],
      }}
      library={{ libraryId: 'library', displayPath: '/Books/Manga' }}
      mapping={{
        mangaTitle: 'A Quiet Journey',
        chapters: [],
        volumes: [{ id: 'v1', number: '1', chapterIds: [] }],
      }}
      onBack={() => undefined}
      onChooseLibrary={() => undefined}
      onFormat={() => undefined}
      onPlan={() => undefined}
      onSettings={() => undefined}
      onStart={() => undefined}
      settings={defaultMangapressSettings}
      planning={false}
      profiles={[
        {
          code: 'KV',
          name: 'Kindle Voyage',
          width: 1072,
          height: 1448,
          grayLevels: 16,
          family: 'kindle',
        },
      ]}
    />
  ),
};

export const JoinVolumesOnly: Story = {
  args: { disabled: false, onChoose: () => undefined },
  render: () => (
    <ConversionSettings
      format="epub"
      inspection={{
        sessionId: 'session',
        displayName: 'A Quiet Journey',
        kind: 'folder',
        issues: [],
      }}
      library={{ libraryId: 'library', displayPath: '/Books/Manga' }}
      mapping={{
        mangaTitle: 'A Quiet Journey',
        chapters: [],
        volumes: [
          { id: 'v1', number: '1', chapterIds: [] },
          { id: 'v2', number: '2', chapterIds: [] },
        ],
      }}
      mode="bind-only"
      onBack={() => undefined}
      onChooseLibrary={() => undefined}
      onFormat={() => undefined}
      onMode={() => undefined}
      onPlan={() => undefined}
      onSettings={() => undefined}
      onStart={() => undefined}
      settings={defaultMangapressSettings}
      planning={false}
      profiles={[
        {
          code: 'KV',
          name: 'Kindle Voyage',
          width: 1072,
          height: 1448,
          grayLevels: 16,
          family: 'kindle',
        },
      ]}
    />
  ),
};

export const Progress: Story = {
  args: { disabled: false, onChoose: () => undefined },
  render: () => (
    <Running
      onCancel={() => undefined}
      progress={{
        stage: 'processing',
        message: 'Processed page 42 of 120.',
        completed: 42,
        total: 120,
        volume: '1 of 2',
      }}
      selection={{
        selectionId: 'selection',
        displayName: 'A Quiet Journey',
        displayPath: '/Manga/A Quiet Journey',
        kind: 'folder',
      }}
    />
  ),
};

export const ValidatedPlan: Story = {
  args: { disabled: false, onChoose: () => undefined },
  render: () => (
    <PlanResult
      plan={{
        tool: 'mangabind',
        title: 'A Quiet Journey',
        message: 'mangabind validated 2 volumes · no library files written',
        books: [
          { name: 'A Quiet Journey - Vol.01.cbz', pageCount: 46 },
          { name: 'A Quiet Journey - Vol.02.cbz', pageCount: 51 },
        ],
        issues: [
          {
            tool: 'mangabind',
            severity: 'warning',
            code: 'chapter_name_normalized',
            stage: 'plan',
            recoverable: true,
            message: 'One chapter name was normalized.',
          },
        ],
      }}
    />
  ),
};

export const Success: Story = {
  args: { disabled: false, onChoose: () => undefined },
  render: () => (
    <Complete
      artifacts={[
        { id: 'one', name: 'A Quiet Journey - Vol.01.epub', bytes: 8_400_000, format: 'epub' },
        { id: 'two', name: 'A Quiet Journey - Vol.02.epub', bytes: 9_100_000, format: 'epub' },
      ]}
      onOpen={() => undefined}
      onShow={() => undefined}
      onStartOver={() => undefined}
    />
  ),
};

export const BatchReviewStory: Story = {
  args: { disabled: false, onChoose: () => undefined },
  render: () => (
    <BatchReview
      batch={{
        titles: [
          {
            title: 'A Quiet Journey',
            inputPath: '/Library/A Quiet Journey',
            status: 'done',
            draft: { mangaTitle: 'A Quiet Journey', chapters: [], volumes: [] },
            volumes: [{ name: 'A Quiet Journey - Vol.01.cbz', pageCount: 46 }],
            issues: [],
            artifacts: [
              {
                id: 'aqj-1',
                name: 'A Quiet Journey - Vol.01.epub',
                bytes: 8_400_000,
                format: 'epub',
              },
            ],
          },
          {
            title: 'Broken Manga',
            inputPath: '/Library/Broken Manga',
            status: 'needsMapping',
            draft: { mangaTitle: 'Broken Manga', chapters: [], volumes: [] },
            volumes: [],
            issues: [
              {
                tool: 'mangabind',
                severity: 'error',
                code: 'metadata_load_failed',
                stage: 'group',
                recoverable: true,
                message: 'mangabind.json could not be parsed.',
              },
            ],
          },
          {
            title: 'Late Bloomer',
            inputPath: '/Library/Late Bloomer',
            status: 'failed',
            draft: { mangaTitle: 'Late Bloomer', chapters: [], volumes: [] },
            volumes: [{ name: 'Late Bloomer - Vol.01.cbz', pageCount: 32 }],
            issues: [],
            artifacts: [],
            failure: {
              code: 'process_failed',
              message: 'mangapress crashed while processing pages.',
            },
          },
          {
            title: 'Wandering Star',
            inputPath: '/Library/Wandering Star',
            status: 'ready',
            draft: { mangaTitle: 'Wandering Star', chapters: [], volumes: [] },
            volumes: [{ name: 'Wandering Star - Vol.01.cbz', pageCount: 40 }],
            issues: [],
          },
        ],
      }}
      displayName="Winter Reading Library"
      format="epub"
      library={{ libraryId: 'library', displayPath: '/Books/Manga' }}
      onCancel={() => undefined}
      onChooseLibrary={() => undefined}
      onFixMapping={() => undefined}
      onFormat={() => undefined}
      onRetry={() => undefined}
      onSettings={() => undefined}
      onStart={() => undefined}
      onStartOver={() => undefined}
      profiles={[
        {
          code: 'KV',
          name: 'Kindle Voyage',
          width: 1072,
          height: 1448,
          grayLevels: 16,
          family: 'kindle',
        },
      ]}
      running={false}
      settings={defaultMangapressSettings}
    />
  ),
};

export const Error: Story = {
  args: { disabled: false, onChoose: () => undefined },
  render: () => (
    <IssueCallout
      failure={{
        code: 'page_processing_failed',
        message: "Couldn't process page 17 in chapter 'Chapter 4'.",
        issue: {
          tool: 'mangapress',
          severity: 'error',
          code: 'page_processing_failed',
          stage: 'process',
          recoverable: true,
          message: "Couldn't process page 17 in chapter 'Chapter 4'.",
          chapter: 'Chapter 4',
          page: 17,
          diagnostic: 'Image decoder rejected the source page.',
        },
      }}
    />
  ),
};
