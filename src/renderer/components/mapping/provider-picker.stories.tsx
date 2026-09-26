import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import type { MetadataProviderDescriptor } from '@/shared/workflow-contract';

import { ProviderPicker } from './provider-picker';

const providers: readonly MetadataProviderDescriptor[] = [
  {
    id: 'mangadex',
    displayName: 'MangaDex',
    homepage: 'https://mangadex.org',
    description: 'Community catalogue of manga, with volume and chapter data',
  },
];

const meta = {
  title: 'Workflows/Provider picker',
  component: ProviderPicker,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground min-h-screen p-8">
        <div className="max-w-sm">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: {
    onSelect: () => undefined,
    providers,
    selectedId: undefined,
  },
} satisfies Meta<typeof ProviderPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing chosen yet: the field names what happens by default. */
export const NoneChosen: Story = {};

/** A source is already chosen, as it would be on returning to the editor. */
export const SourceChosen: Story = { args: { selectedId: 'mangadex' } };

/** The list, open, before a choice is made. */
export const ListOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Source' }));
    await expect(canvas.getByRole('option', { name: /MangaDex/u })).toBeVisible();
  },
};
