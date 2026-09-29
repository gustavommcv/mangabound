import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

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

/** The calm summary stays put; a reader may open the live progress for each volume. */
export const MultipleVolumes: Story = {
  args: {
    position: { name: 'Chainsaw Man', index: 1, total: 1 },
    progress: {
      stage: 'processing',
      message: '4 of 11 volumes converted.',
      completed: 5.4,
      total: 11,
      volumes: [
        { number: 1, status: 'done', completed: 182, total: 182 },
        { number: 2, status: 'done', completed: 180, total: 180 },
        { number: 3, status: 'done', completed: 178, total: 178 },
        { number: 4, status: 'done', completed: 175, total: 175 },
        { number: 5, status: 'processing', completed: 80, total: 200 },
        { number: 6, status: 'saving', completed: 180, total: 180 },
        ...[7, 8, 9, 10, 11].map((number) => ({ number, status: 'waiting' as const })),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Show details' }));
    await expect(canvas.getByRole('region', { name: 'Volume details' })).toBeVisible();
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
