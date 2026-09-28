import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { defaultMangapressSettings } from '@/domain/output-profile';

import { MangapressSettingsEditor } from './mangapress-settings';

const profiles = [
  {
    code: 'KPW6',
    name: 'Kindle Paperwhite 6',
    width: 1272,
    height: 1696,
    grayLevels: 16,
    family: 'kindle',
  },
  {
    code: 'OTHER',
    name: 'Custom',
    width: 0,
    height: 0,
    grayLevels: 256,
    family: 'other',
  },
  {
    code: 'KS',
    name: 'Kindle Scribe',
    width: 1860,
    height: 2480,
    grayLevels: 16,
    family: 'kindle',
  },
] as const;

const meta = {
  title: 'Workflows/Output settings',
  component: MangapressSettingsEditor,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground min-h-screen p-8">
        <div className="mx-auto max-w-5xl">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: {
    format: 'epub',
    onFormat: () => undefined,
    onNotify: () => undefined,
    onSettings: () => undefined,
    profiles,
    settings: defaultMangapressSettings,
  },
} satisfies Meta<typeof MangapressSettingsEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {};

export const ModifiedOptions: Story = {
  args: {
    format: 'cbz',
    settings: {
      ...defaultMangapressSettings,
      deviceProfile: 'KS',
      upscale: false,
      mangaStyle: false,
      splitter: 'rotate',
      gamma: 1.2,
      jpegQuality: 80,
      title: 'Example title',
      quiet: true,
    },
  },
};

export const ConditionalControls: Story = {
  args: {
    format: 'cbz',
    settings: {
      ...defaultMangapressSettings,
      forcePng: true,
      noAutoContrast: true,
      wallpaper: true,
    },
  },
};

export const ValidationError: Story = {
  args: {
    settings: { ...defaultMangapressSettings, deviceProfile: 'OTHER' },
  },
};

/** When single-book mode is active from the queue, format is locked to EPUB and status shows active. */
export const SingleBookActive: Story = {
  args: {
    singleBook: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('combobox', { name: 'Book format' })).toBeDisabled();
    await expect(canvas.getByRole('status')).toHaveTextContent('Single book for the series');
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Active from the queue: the series will be produced as a single EPUB',
    );
  },
};
