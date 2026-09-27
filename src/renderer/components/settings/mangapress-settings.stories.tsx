import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import type { BookFormat } from '@/domain/conversion';
import { defaultMangapressSettings, type MangapressSettings } from '@/domain/output-profile';

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

/** Combining is already on: CBZ and PDF are ruled out in the format list. */
export const CombinedIntoOneVolume: Story = {
  args: {
    settings: { ...defaultMangapressSettings, combineIntoOneVolume: true },
  },
};

/**
 * A stateful stand-in for the parent that actually owns format/settings/notices (app.tsx), so the
 * play function below can assert on real, visible results - the format field's own value changing,
 * a notice appearing - rather than a mocked callback having been called with something.
 */
function Stateful({ initialFormat }: { readonly initialFormat: BookFormat }) {
  const [format, setFormat] = useState(initialFormat);
  const [settings, setSettings] = useState<MangapressSettings>(defaultMangapressSettings);
  const [notice, setNotice] = useState<string>();
  return (
    <>
      {notice !== undefined && <p role="status">{notice}</p>}
      <MangapressSettingsEditor
        format={format}
        onFormat={setFormat}
        onNotify={setNotice}
        onSettings={setSettings}
        profiles={profiles}
        settings={settings}
      />
    </>
  );
}

/** Checking the box while on CBZ or PDF switches to EPUB and says why. */
export const CombiningSwitchesAwayFromCbz: Story = {
  render: () => <Stateful initialFormat="cbz" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('checkbox', { name: /Bind the whole series/u }));
    await expect(canvas.getByRole('combobox', { name: 'Book format' })).toHaveValue('epub');
    await expect(canvas.getByRole('status')).toHaveTextContent('Switched to EPUB');
  },
};
