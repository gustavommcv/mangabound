import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LibraryTitle } from '@/domain/input-queue';
import { createMappingDraft } from '@/domain/mapping';
import { KoreaderCard } from '@/renderer/components/sharing/koreader-card';
import { SegmentedControl } from '@/renderer/components/ui/segmented-control';
import { LibraryScreen } from '@/renderer/screens/library-screen';
import { formatBytes, ResultsScreen, type RunOutcome } from '@/renderer/screens/results-screen';

const options = [
  { value: 'epub', label: 'EPUB' },
  { value: 'cbz', label: 'CBZ' },
  { value: 'pdf', label: 'PDF' },
] as const;

describe('SegmentedControl', () => {
  it('shows one choice as selected and reports a click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedControl label="Format" onChange={onChange} options={options} value="epub" />);

    expect(screen.getByRole('radiogroup', { name: 'Format' })).toBeVisible();
    expect(screen.getByRole('radio', { name: 'EPUB' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'CBZ' })).not.toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'PDF' }));
    expect(onChange).toHaveBeenCalledWith('pdf');
  });

  it.each([
    ['{ArrowRight}', 'cbz'],
    ['{ArrowDown}', 'cbz'],
    ['{ArrowLeft}', 'pdf'],
    ['{ArrowUp}', 'pdf'],
  ])('moves the choice with %s, wrapping around the ends', async (key, expected) => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedControl label="Format" onChange={onChange} options={options} value="epub" />);

    screen.getByRole('radio', { name: 'EPUB' }).focus();
    await user.keyboard(key);

    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it('ignores other keys and does nothing while disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <SegmentedControl label="Format" onChange={onChange} options={options} value="cbz" />,
    );

    screen.getByRole('radio', { name: 'CBZ' }).focus();
    await user.keyboard('a');
    expect(onChange).not.toHaveBeenCalled();

    rerender(
      <SegmentedControl
        disabled
        label="Format"
        onChange={onChange}
        options={options}
        value="cbz"
      />,
    );
    await user.click(screen.getByRole('radio', { name: 'PDF' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('only puts the selected choice in the tab order', () => {
    render(<SegmentedControl label="Format" onChange={vi.fn()} options={options} value="cbz" />);

    expect(screen.getByRole('radio', { name: 'CBZ' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'EPUB' })).toHaveAttribute('tabindex', '-1');
  });
});

describe('KoreaderCard', () => {
  const wifi = { name: 'Wi-Fi', address: '192.168.1.24' };
  const ethernet = { name: 'Ethernet', address: '10.0.0.7' };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts sharing on the only network without asking which one', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <KoreaderCard
        interfaces={[wifi]}
        onStart={onStart}
        onStop={vi.fn()}
        status={{ active: false }}
      />,
    );

    expect(screen.queryByLabelText('Network')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start sharing' }));

    expect(onStart).toHaveBeenCalledWith('192.168.1.24');
  });

  it('lets the network be chosen when there are several', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <KoreaderCard
        interfaces={[wifi, ethernet]}
        onStart={onStart}
        onStop={vi.fn()}
        status={{ active: false }}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Network'), '10.0.0.7');
    await user.click(screen.getByRole('button', { name: 'Start sharing' }));

    expect(onStart).toHaveBeenCalledWith('10.0.0.7');
  });

  it('says so when there is no network to share on', () => {
    render(
      <KoreaderCard
        interfaces={[]}
        onStart={vi.fn()}
        onStop={vi.fn()}
        status={{ active: false }}
      />,
    );

    expect(screen.getByText(/No local network address was found/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Start sharing' })).not.toBeInTheDocument();
  });

  it('shows the address with its token, copies it and stops on request', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(
      <KoreaderCard
        interfaces={[wifi]}
        onStart={vi.fn()}
        onStop={onStop}
        status={{
          active: true,
          url: 'http://192.168.1.24:8080/opds',
          authMode: 'token',
          token: 'abc123',
        }}
      />,
    );

    const address = 'http://192.168.1.24:8080/opds/?token=abc123';
    expect(screen.getByLabelText('Address')).toHaveValue(address);
    expect(screen.getByText('Sharing')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Copy the address' }));
    expect(writeText).toHaveBeenCalledWith(address);
    expect(await screen.findByText('Copied')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('shows the plain address when sharing needs no token, and copes with a refused copy', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    render(
      <KoreaderCard
        interfaces={[wifi]}
        onStart={vi.fn()}
        onStop={vi.fn()}
        status={{ active: true, url: 'http://192.168.1.24:8080/opds', authMode: 'basic' }}
      />,
    );

    expect(screen.getByLabelText('Address')).toHaveValue('http://192.168.1.24:8080/opds');
    await user.click(screen.getByRole('button', { name: 'Copy the address' }));
    expect(screen.getByRole('button', { name: 'Copy the address' })).toHaveTextContent('Copy');
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  });
});

describe('ResultsScreen', () => {
  const saved: RunOutcome = {
    rowId: 'a',
    name: 'Work',
    status: 'done',
    artifacts: [{ id: 'one', name: 'Work.epub', bytes: 1536, format: 'epub' }],
  };
  const handlers = {
    onBack: vi.fn(),
    onFix: vi.fn(),
    onOpen: vi.fn(),
    onShow: vi.fn(),
  };

  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1536, '1.5 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
  ])('formats %i bytes as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it('counts the saved books, showing each with its size, and reports the summary', () => {
    render(
      <ResultsScreen {...handlers} outcomes={[saved]} summary="Kindle Voyage · EPUB · C:\Books" />,
    );

    expect(screen.getByRole('heading', { name: '1 book saved' })).toBeVisible();
    expect(screen.getByText('Kindle Voyage · EPUB · C:\\Books')).toBeVisible();
    expect(screen.getByText('1.5 KB')).toBeVisible();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('uses the plural for several books and shows the side card beside the list', () => {
    render(
      <ResultsScreen
        {...handlers}
        aside={<p>Side card</p>}
        outcomes={[
          saved,
          {
            ...saved,
            rowId: 'b',
            artifacts: [{ id: 'two', name: 'Other.epub', bytes: 10, format: 'epub' }],
          },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: '2 books saved' })).toBeVisible();
    expect(screen.getByText('Side card')).toBeVisible();
  });

  it('says nothing was saved and explains each problem, offering a fix only where one exists', async () => {
    const user = userEvent.setup();
    const onFix = vi.fn();
    const onBack = vi.fn();
    render(
      <ResultsScreen
        {...handlers}
        onBack={onBack}
        onFix={onFix}
        outcomes={[
          {
            rowId: 'x',
            name: 'Loose',
            status: 'skipped',
            artifacts: [],
            message: 'No volumes yet.',
            fixable: true,
          },
          { rowId: 'y', name: 'Broken', status: 'failed', artifacts: [], message: 'It crashed.' },
          { rowId: 'z', name: 'Silent', status: 'skipped', artifacts: [] },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Nothing was saved' })).toBeVisible();
    expect(screen.getByText('Loose was skipped')).toBeVisible();
    expect(screen.getByText('Broken could not be converted')).toBeVisible();
    expect(screen.getByText('It crashed.')).toBeVisible();
    expect(screen.getAllByRole('button', { name: /^Fix / })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Fix Loose' }));
    expect(onFix).toHaveBeenCalledWith('x');
    await user.click(screen.getByRole('button', { name: 'Convert more' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('LibraryScreen', () => {
  const chapters = [
    { id: 'c1', name: 'Chapter 1', path: '/m/1', pageCount: 2, chapter: 1 },
    { id: 'c2', name: 'Chapter 2', path: '/m/2', pageCount: 2, chapter: 2 },
  ] as const;
  const volume = { name: 'Vol.01.cbz', pageCount: 4 };
  const titles: readonly LibraryTitle[] = [
    {
      title: 'Whole',
      draft: createMappingDraft({
        mangaTitle: 'Whole',
        chapters,
        volumes: [{ id: 'v1', number: '1', chapterIds: ['c1', 'c2'] }],
      }),
      volumes: [volume],
    },
    {
      title: 'Partial',
      draft: createMappingDraft({
        mangaTitle: 'Partial',
        chapters,
        volumes: [{ id: 'v1', number: '1', chapterIds: ['c1'] }],
      }),
      volumes: [volume],
    },
    { title: 'Loose', draft: createMappingDraft({ mangaTitle: 'Loose', chapters }), volumes: [] },
    {
      title: 'Saved',
      draft: createMappingDraft({ mangaTitle: 'Saved', chapters }),
      volumes: [volume],
      outcome: { status: 'done' },
    },
    {
      title: 'Crashed',
      draft: createMappingDraft({ mangaTitle: 'Crashed', chapters }),
      volumes: [volume],
      outcome: { status: 'failed', message: 'mangapress crashed.' },
    },
  ];

  it('says what each title needs and what became of it', () => {
    render(<LibraryScreen name="Library" onBack={vi.fn()} onEdit={vi.fn()} titles={titles} />);

    expect(screen.getByRole('heading', { name: 'Library' })).toBeVisible();
    expect(screen.getByText(/5 titles\./u)).toBeVisible();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent('Whole2 chapters1 volume');
    expect(rows[1]).toHaveTextContent('1 chapter left out');
    expect(rows[2]).toHaveTextContent('Needs volumes');
    // A title that was saved has nothing left to edit.
    expect(rows[3]).toHaveTextContent('Saved');
    expect(
      screen.queryByRole('button', { name: 'Edit volumes for Saved' }),
    ).not.toBeInTheDocument();
    expect(rows[4]).toHaveTextContent('Failed');
    expect(rows[4]).toHaveTextContent('mangapress crashed.');
  });

  it('opens a title in the editor and goes back to the queue', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onBack = vi.fn();
    render(<LibraryScreen name="Library" onBack={onBack} onEdit={onEdit} titles={titles} />);

    await user.click(screen.getByRole('button', { name: 'Edit volumes for Loose' }));
    await user.click(screen.getByRole('button', { name: 'Queue' }));

    expect(onEdit).toHaveBeenCalledWith('Loose');
    expect(onBack).toHaveBeenCalledOnce();
  });
});
