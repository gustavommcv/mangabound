import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import type { MetadataProviderDescriptor } from '@/shared/workflow-contract';

import { ChaptersFrom, type OnlineSource } from './chapters-from';

const mangaDex: MetadataProviderDescriptor = {
  id: 'mangadex',
  displayName: 'MangaDex',
  homepage: 'https://mangadex.org',
  description: 'Community catalogue of manga, with volume and chapter data',
};

const search = () =>
  Promise.resolve([
    { id: 'work-1', title: 'A Quiet Journey', provider: 'mangadex' },
    { id: 'work-2', title: 'A Quiet Journey (Omnibus)', provider: 'mangadex' },
  ]);
const suggest = () =>
  Promise.resolve({
    volumes: [
      { number: '1', chapterNumbers: [1, 2] },
      { number: '2', chapterNumbers: [3, 4] },
    ],
  });

const meta = {
  title: 'Workflows/Chapters from',
  component: ChaptersFrom,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground min-h-screen p-8">
        <div className="mx-auto max-w-2xl">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: {
    names: {
      volumes: 2,
      chapters: 12,
      changed: false,
      onStartOver: () => undefined,
    },
  },
} satisfies Meta<typeof ChaptersFrom>;

export default meta;
type Story = StoryObj<typeof meta>;

/** What mangabind read from the folder names, nothing edited yet. */
export const FromNames: Story = {};

/** The names gave nothing to work with: every chapter is still loose. */
export const NoVolumesFromNames: Story = {
  args: { names: { volumes: 0, chapters: 8, changed: false, onStartOver: () => undefined } },
};

/** Editing has moved away from what mangabind proposed, so starting over is live. */
export const ChangedSinceNames: Story = {
  args: { names: { ...meta.args.names, changed: true } },
};

const onlineArgs = {
  online: {
    providers: [mangaDex],
    selectedId: undefined,
    onSelect: () => undefined,
    onOpenHomepage: () => undefined,
    mangaTitle: 'A Quiet Journey',
    language: 'en',
    onSearch: search,
    onSuggest: suggest,
    onApply: () => undefined,
  },
};

/** A source is offered, none chosen: nothing has been sent anywhere yet. */
export const OnlineSourceOffered: Story = {
  args: onlineArgs,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('tab', { name: 'Online source' }));
    await within(canvasElement).findByRole('combobox', { name: 'Source' });
  },
};

/**
 * Picking a source, searching, and getting matches back, end to end. ChaptersFrom takes
 * `selectedId` by prop rather than owning it (screens below the state-holding root are "dumb",
 * props in, callbacks out), so this story stands in for the parent that would normally track it.
 */
function StatefulOnline(props: { readonly online: OnlineSource }) {
  const [selectedId, setSelectedId] = useState(props.online.selectedId);
  return (
    <ChaptersFrom
      names={meta.args.names}
      online={{ ...props.online, selectedId, onSelect: setSelectedId }}
    />
  );
}

export const OnlineSearchResults: Story = {
  args: onlineArgs,
  render: (args) => <StatefulOnline online={args.online ?? onlineArgs.online} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'Online source' }));
    await userEvent.click(await canvas.findByRole('combobox', { name: 'Source' }));
    await userEvent.click(await canvas.findByRole('option', { name: /MangaDex/u }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Search' }));
    await expect(await canvas.findAllByRole('button', { name: 'Use these volumes' })).toHaveLength(
      2,
    );
  },
};

/** A search that finds nothing to apply. */
export const OnlineSearchNoMatches: Story = {
  args: {
    online: { ...onlineArgs.online, selectedId: 'mangadex', onSearch: () => Promise.resolve([]) },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'Online source' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Search' }));
    await expect(await canvas.findByText('No matches found.')).toBeVisible();
  },
};

/** The search itself failed, such as the service being unreachable. */
export const OnlineSearchFailed: Story = {
  args: {
    online: {
      ...onlineArgs.online,
      selectedId: 'mangadex',
      onSearch: () => Promise.reject(new Error('MangaDex could not be reached.')),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'Online source' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Search' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'MangaDex could not be reached.',
    );
  },
};

/** Chapters are grouped entirely by hand: nothing is read from names or sent anywhere. */
export const Manual: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'Manual' }));
    await expect(canvas.getByText(/Add a volume with the plus button/u)).toBeVisible();
  },
};
