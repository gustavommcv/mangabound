import type { Meta, StoryObj } from '@storybook/react-vite';

import { defaultMangapressSettings } from '@/domain/output-profile';

import { MangapressSettingsEditor } from './mangapress-settings';

const profiles = [
  {
    code: 'KV',
    name: 'Kindle Voyage',
    width: 1072,
    height: 1448,
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
    onSettings: () => undefined,
    profiles,
    settings: defaultMangapressSettings,
  },
} satisfies Meta<typeof MangapressSettingsEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {};

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
