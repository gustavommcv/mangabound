import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import type { BookDetails } from '@/domain/book-details';

import { BookDetailsScreen, type BookDetailsScreenProps } from './book-details-screen';

/** Keeps what is typed, the way the queue does, so the stories can be used as they would be. */
function Stateful(props: BookDetailsScreenProps): React.JSX.Element {
  const [details, setDetails] = useState<BookDetails>(props.details);
  return <BookDetailsScreen {...props} details={details} onChange={setDetails} />;
}

const meta = {
  title: 'Workflows/Book details',
  component: BookDetailsScreen,
  render: (args) => <Stateful {...args} />,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground min-h-screen px-8 py-10">
        <div className="mx-auto max-w-6xl">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: {
    backLabel: 'Queue',
    defaultLanguage: 'en-US',
    defaultTitle: 'Chainsaw Man',
    details: {},
    format: 'epub',
    name: 'Chainsaw Man',
    onBack: () => undefined,
    onChange: () => undefined,
    volumes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  },
} satisfies Meta<typeof BookDetailsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A series of volumes with nothing typed yet: every field shows its default. */
export const Series: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Series title')).toHaveAttribute(
      'placeholder',
      'Chainsaw Man',
    );
    await expect(canvas.getByLabelText('Language')).toHaveAttribute('placeholder', 'en-US');
    const titles = within(canvas.getByRole('list', { name: 'Book titles' }));
    await expect(titles.getByText('Chainsaw Man - Vol.01')).toBeVisible();
    await expect(titles.getByText(/and 8 more/u)).toBeVisible();
  },
};

/** A title and an author typed for a series: the preview follows the title. */
export const TypedForASeries: Story = {
  args: { details: { title: 'Chainsaw Man (Deluxe)', author: 'Fujimoto Tatsuki' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Author')).toHaveValue('Fujimoto Tatsuki');
    await userEvent.type(canvas.getByLabelText('Series title'), ' 2');
    await expect(canvas.getByLabelText('Series title')).toHaveValue('Chainsaw Man (Deluxe) 2');
    await expect(canvas.getByText('Chainsaw Man (Deluxe) 2 - Vol.01')).toBeVisible();
  },
};

/** A folder mangabind could not group yet: the title still means the series. */
export const SeriesWithoutVolumesYet: Story = {
  args: { volumes: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/Once the volumes are set/u)).toBeVisible();
  },
};

/** A loose CBZ, or a series made into one book: the title is the book's, with no volumes. */
export const OneBook: Story = {
  args: { name: 'Vagabond Vol.03.cbz', defaultTitle: 'Vagabond Vol.03' },
  render: (args) => {
    const { volumes: _volumes, ...rest } = args;
    void _volumes;
    return <Stateful {...rest} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Book title')).toBeVisible();
    await expect(canvas.getByText('The book will be titled')).toBeVisible();
    await expect(
      within(canvas.getByRole('list', { name: 'Book titles' })).getByText('Vagabond Vol.03'),
    ).toBeVisible();
  },
};

/** A CBZ file cannot store an author, and the screen says so. */
export const CbzOutput: Story = {
  args: { format: 'cbz' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/CBZ files do not store an author/u),
    ).toBeVisible();
  },
};

/** The folder names declare another language than the one books are made in. */
export const FolderDeclaresAnotherLanguage: Story = {
  args: { declaredLanguage: 'pt-br' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('The folder names say pt-br.')).toBeVisible();
  },
};

/** A language that is not a tag is refused where it is typed, instead of when the run starts. */
export const InvalidLanguage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Language'), 'portuguese please');
    await expect(canvas.getByLabelText('Language')).toBeInvalid();
    await expect(canvas.getByText(/Use a language tag such as en-US or pt-br/u)).toBeVisible();
  },
};

/** A title inside a library: Back returns to the library, not the queue. */
export const InALibrary: Story = {
  args: { backLabel: 'Manga Library', name: 'Vagabond', defaultTitle: 'Vagabond' },
};
