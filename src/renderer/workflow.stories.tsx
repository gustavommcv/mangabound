import type { Meta, StoryObj } from '@storybook/react-vite';

import { IssueCallout } from './app';
import { RunningScreen } from './screens/running-screen';

const meta = {
  title: 'Workflows/Run and errors',
  component: RunningScreen,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground min-h-screen p-10">
        <div className="mx-auto max-w-6xl">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof RunningScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Progress: Story = {
  args: {
    onCancel: () => undefined,
    position: { name: 'A Quiet Journey', index: 2, total: 5 },
    progress: {
      stage: 'processing',
      message: 'Processed page 42 of 120.',
      completed: 42,
      total: 120,
      volume: '1 of 2',
    },
  },
};

export const Error: Story = {
  args: { onCancel: () => undefined },
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
