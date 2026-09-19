import type { Meta, StoryObj } from '@storybook/react-vite';

import { defaultMangapressSettings } from '@/domain/output-profile';

import { BatchReview, Inspecting, IssueCallout } from './app';
import { RunningScreen } from './screens/running-screen';

const frame = (Story: React.ComponentType): React.JSX.Element => (
  <div className="bg-background text-foreground min-h-screen p-10">
    <div className="mx-auto max-w-6xl">
      <Story />
    </div>
  </div>
);

const meta = {
  title: 'Workflows/Single input',
  component: Inspecting,
  decorators: [frame],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Inspecting>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
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

export const Progress: Story = {
  render: () => (
    <RunningScreen
      onCancel={() => undefined}
      position={{ name: 'A Quiet Journey', index: 2, total: 5 }}
      progress={{
        stage: 'processing',
        message: 'Processed page 42 of 120.',
        completed: 42,
        total: 120,
        volume: '1 of 2',
      }}
    />
  ),
};

export const BatchReviewStory: Story = {
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
