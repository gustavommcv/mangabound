import type { Meta, StoryObj } from '@storybook/react-vite';

import { ProcessSteps } from './process-steps';

const meta = {
  title: 'Workflows/Process steps',
  component: ProcessSteps,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground min-h-screen p-8">
        <div className="border-border bg-surface mx-auto max-w-sm rounded-xl border p-6">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: { onMode: () => undefined },
} satisfies Meta<typeof ProcessSteps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FolderBothSteps: Story = {
  args: { input: 'folder', mode: 'bind-and-convert' },
};

export const JoinOnly: Story = {
  args: { input: 'folder', mode: 'bind-only' },
};

export const ConvertOnly: Story = {
  args: { input: 'folder', mode: 'convert-only' },
};

export const CbzHasOneProcess: Story = {
  args: { input: 'cbz', mode: 'convert-only' },
};

export const LibraryIsAlwaysGrouped: Story = {
  args: { input: 'library', mode: 'bind-and-convert' },
};

export const LockedWhileRunning: Story = {
  args: { input: 'library', mode: 'bind-only', disabled: true },
};
