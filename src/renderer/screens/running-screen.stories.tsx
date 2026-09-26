import type { Meta, StoryObj } from '@storybook/react-vite';

import { RunningScreen } from './running-screen';

const meta = {
  title: 'Workflows/Running',
  component: RunningScreen,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground min-h-screen p-8">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: {
    onCancel: () => undefined,
  },
} satisfies Meta<typeof RunningScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A single item, before the tools have reported anything yet. */
export const Starting: Story = {};

/** One item, partway through, with a stage message and a percentage. */
export const SingleItemInProgress: Story = {
  args: {
    position: { name: 'Chainsaw Man', index: 1, total: 1 },
    progress: {
      stage: 'processing',
      message: 'Converting Chapter 4 of 8',
      completed: 4,
      total: 8,
    },
  },
};

/** A batch: which item and how many in total, alongside the same progress. */
export const BatchInProgress: Story = {
  args: {
    position: { name: 'Vagabond', index: 2, total: 5 },
    progress: {
      stage: 'binding',
      message: 'Grouping chapters into volumes',
    },
  },
};

/** The last step, close to done. */
export const NearlyDone: Story = {
  args: {
    position: { name: 'Monster', index: 5, total: 5 },
    progress: {
      stage: 'saving',
      message: 'Writing the finished book to the library',
      completed: 19,
      total: 20,
    },
  },
};
