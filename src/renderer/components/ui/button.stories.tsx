import type { Meta, StoryObj } from '@storybook/react-vite';
import { LoaderCircle } from 'lucide-react';

import { Button } from './button';

const meta = {
  title: 'Design system/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {
  args: {
    children: 'Continue',
  },
};

export const Loading: Story = {
  args: {
    children: (
      <>
        <LoaderCircle aria-hidden="true" className="animate-spin" />
        Processing
      </>
    ),
    disabled: true,
  },
};

export const Disabled: Story = {
  args: {
    children: 'Unavailable',
    disabled: true,
  },
};

export const ErrorAction: Story = {
  args: {
    children: 'Remove failed job',
    variant: 'destructive',
  },
};

export const StateGallery: Story = {
  render: () => (
    <div className="bg-background grid min-w-xl grid-cols-2 gap-6 rounded-xl p-8">
      <Button>Normal</Button>
      <Button variant="outline">Secondary</Button>
      <Button disabled>Disabled</Button>
      <Button variant="destructive">Error action</Button>
      <Button disabled>
        <LoaderCircle aria-hidden="true" className="animate-spin" />
        Loading
      </Button>
      <Button variant="ghost">Quiet action</Button>
    </div>
  ),
};
