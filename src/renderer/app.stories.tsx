import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import { App } from './app';

const meta = {
  title: 'Shell/Application startup',
  component: App,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MissingDesktopBridge: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert', { name: 'Startup error' })).toBeVisible();
    await expect(
      canvas.getByText('Restart the app. If the problem persists, reinstall Mangabound.'),
    ).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Share' })).toBeNull();
  },
};
