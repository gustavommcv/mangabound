import { describe, expect, it, vi } from 'vitest';

import { keepsNoCovers } from '@/application/workflows/book-covers';
import { ConversionWorkflow } from '@/application/workflows/conversion-workflow';
import { defaultMangapressSettings } from '@/domain/output-profile';

import {
  cbz,
  dependencies,
  folder,
  mappedDraft,
  memoryCovers,
  openLibrary,
} from './support/conversion-workflow';

function workflowWith(
  ports: ReturnType<typeof dependencies>,
  covers: ReturnType<typeof memoryCovers>,
) {
  let id = 0;
  return new ConversionWorkflow(
    ports.binding,
    ports.conversion,
    () => `id-${String(++id)}`,
    ports.bookFiles,
    1,
    covers.store,
  );
}

const run = {
  libraryPath: '/library',
  settings: defaultMangapressSettings,
  format: 'epub',
} as const;
const coversSent = (ports: ReturnType<typeof dependencies>) =>
  ports.convert.mock.calls.map(([request]) => request.cover);

describe('the covers a person gives the books of an item', () => {
  it('chooses one image for one book, and tells the screen its name, never where it is kept', async () => {
    const ports = dependencies();
    const covers = memoryCovers();
    const workflow = workflowWith(ports, covers);
    const { sessionId } = await workflow.inspect(folder);

    await expect(workflow.covers.list(sessionId)).resolves.toEqual([]);
    const change = await workflow.covers.choose({ sessionId }, 2, '/pictures/IMG_2041.jpg');

    expect(change).toEqual({ covers: [{ slot: 2, name: 'IMG_2041.jpg', origin: 'chosen' }] });
    await expect(workflow.covers.list(sessionId)).resolves.toEqual(change.covers);
    // Kept under the folder the session was read from, not under anything the screen named.
    expect([...covers.kept.keys()]).toEqual(['/input/Trusted Manga']);
  });

  it('refuses a file that is not an image mangapress reads, and says which kinds are', async () => {
    const ports = dependencies();
    const covers = memoryCovers();
    const workflow = workflowWith(ports, covers);
    const { sessionId } = await workflow.inspect(folder);

    await expect(workflow.covers.choose({ sessionId }, 1, '/pictures/notes.txt')).resolves.toEqual({
      covers: [],
      note: 'A cover has to be a JPEG, PNG, WebP, GIF or BMP image.',
    });
    expect(covers.kept.size).toBe(0);
  });

  it('takes a folder in order, keeping what was chosen by hand and replacing an earlier folder', async () => {
    const ports = dependencies();
    const covers = memoryCovers({
      '/first': ['01.jpg', '02.jpg', '03.jpg', 'notes.txt'],
      '/second': ['a.png', 'b.png'],
    });
    const workflow = workflowWith(ports, covers);
    const { sessionId } = await workflow.inspect(folder);
    await workflow.covers.choose({ sessionId }, 2, '/pictures/mine.png');

    const first = await workflow.covers.takeInOrder({ sessionId }, [1, 2, 3], ['/first']);
    expect(first.covers).toEqual([
      { slot: 2, name: 'mine.png', origin: 'chosen' },
      { slot: 1, name: '01.jpg', origin: 'folder' },
      { slot: 3, name: '03.jpg', origin: 'folder' },
    ]);
    expect(first.note).toBe('1 book keeps the cover chosen for it.');

    const second = await workflow.covers.takeInOrder({ sessionId }, [1, 2, 3], ['/second']);
    expect(second.covers).toEqual(
      expect.arrayContaining([
        { slot: 1, name: 'a.png', origin: 'folder' },
        { slot: 2, name: 'mine.png', origin: 'chosen' },
        { slot: 3, name: '03.jpg', origin: 'folder' },
      ]),
    );
    expect(second.note).toBe(
      '1 book keeps the cover chosen for it. There were 2 images for 3 books; the other books are unchanged.',
    );
  });

  it('fills every book without a word when the folder has one image for each', async () => {
    const ports = dependencies();
    const covers = memoryCovers({ '/covers-folder': ['2.jpg', '1.jpg'] });
    const workflow = workflowWith(ports, covers);
    const { sessionId } = await workflow.inspect(folder);

    const change = await workflow.covers.takeInOrder({ sessionId }, [1, 2], ['/covers-folder']);

    expect(change).toEqual({
      covers: [
        { slot: 1, name: '1.jpg', origin: 'folder' },
        { slot: 2, name: '2.jpg', origin: 'folder' },
      ],
    });
  });

  it('takes one image dropped on a book for that book, and anything else in order', async () => {
    const ports = dependencies();
    const covers = memoryCovers({ '/dropped-folder': ['x.jpg', 'y.jpg'] });
    const workflow = workflowWith(ports, covers);
    const { sessionId } = await workflow.inspect(folder);
    const slots = [1, 2, 3];

    // One image on the third book: chosen for it.
    await expect(
      workflow.covers.drop({ sessionId }, slots, 3, ['/pictures/three.jpg']),
    ).resolves.toEqual({ covers: [{ slot: 3, name: 'three.jpg', origin: 'chosen' }] });
    // A folder on a book is not that book's cover: its images go to the books in order.
    const fromFolder = await workflow.covers.drop({ sessionId }, slots, 3, ['/dropped-folder']);
    expect(fromFolder.covers).toEqual(
      expect.arrayContaining([
        { slot: 1, name: 'x.jpg', origin: 'folder' },
        { slot: 2, name: 'y.jpg', origin: 'folder' },
        { slot: 3, name: 'three.jpg', origin: 'chosen' },
      ]),
    );
    // Several images on a book, or one on the list itself, are taken in order too.
    const several = await workflow.covers.drop({ sessionId }, slots, 2, [
      '/pictures/b.jpg',
      '/pictures/a.jpg',
    ]);
    expect(several.covers).toEqual(
      expect.arrayContaining([
        { slot: 1, name: 'a.jpg', origin: 'folder' },
        { slot: 2, name: 'b.jpg', origin: 'folder' },
      ]),
    );
    const onTheList = await workflow.covers.drop({ sessionId }, slots, undefined, [
      '/pictures/only.jpg',
    ]);
    expect(onTheList.covers).toContainEqual({ slot: 1, name: 'only.jpg', origin: 'folder' });
    // Something that is no image, dropped on a book, changes nothing and says why.
    const nothing = await workflow.covers.drop({ sessionId }, slots, 1, ['/pictures/readme.md']);
    expect(nothing.note).toContain('No image was found there.');
    expect(nothing.covers).toEqual(onTheList.covers);
  });

  it('removes the cover of one book', async () => {
    const ports = dependencies();
    const covers = memoryCovers();
    const workflow = workflowWith(ports, covers);
    const { sessionId } = await workflow.inspect(cbz);
    await workflow.covers.choose({ sessionId }, 'book', '/pictures/front.png');

    await expect(workflow.covers.remove({ sessionId }, 'book')).resolves.toEqual({ covers: [] });
    expect([...covers.kept.keys()]).toEqual(['/input/Standalone.cbz']);
  });

  it('keeps the covers of a library’s title under that title’s own folder', async () => {
    const ports = dependencies();
    const covers = memoryCovers();
    const { workflow, sessionId } = await openLibrary(ports, 1, covers.store);

    await workflow.covers.choose({ sessionId, title: 'Good Manga' }, 1, '/pictures/good.jpg');

    expect([...covers.kept.keys()]).toEqual(['/library/Good Manga']);
    await expect(workflow.covers.list(sessionId, 'Good Manga')).resolves.toHaveLength(1);
    // A library is made of titles: it has no covers of its own, and an unknown title has none.
    await expect(workflow.covers.list(sessionId)).rejects.toMatchObject({
      code: 'unsupported_mode',
    });
    await expect(workflow.covers.list(sessionId, 'Gone Manga')).rejects.toMatchObject({
      code: 'title_not_found',
    });
    await expect(workflow.covers.list('no-such-session')).rejects.toMatchObject({
      code: 'session_not_found',
    });
  });

  it('keeps nothing when the workflow was built without a store', async () => {
    const ports = dependencies();
    const workflow = new ConversionWorkflow(
      ports.binding,
      ports.conversion,
      () => 'id',
      ports.bookFiles,
    );
    const { sessionId } = await workflow.inspect(folder);

    await expect(workflow.covers.choose({ sessionId }, 1, '/pictures/a.jpg')).resolves.toEqual({
      covers: [],
      note: 'A cover has to be a JPEG, PNG, WebP, GIF or BMP image.',
    });
    await expect(workflow.covers.remove({ sessionId }, 1)).resolves.toEqual({ covers: [] });
    // Handed an image all the same, such a store takes it and has nothing to show for it.
    await keepsNoCovers.attach('/input/Trusted Manga', {
      slot: 1,
      origin: 'chosen',
      sourcePath: '/pictures/a.jpg',
    });
    await expect(keepsNoCovers.list('/input/Trusted Manga')).resolves.toEqual([]);
  });
});

describe('the covers a run hands to mangapress', () => {
  it('gives each volume the cover kept for its number, and none to the others', async () => {
    const ports = dependencies();
    const covers = memoryCovers();
    const workflow = workflowWith(ports, covers);
    const { sessionId } = await workflow.inspect(folder);
    await workflow.covers.choose({ sessionId }, 2, '/pictures/two.jpg');
    // A cover for the one book is not a volume's.
    await workflow.covers.choose({ sessionId }, 'book', '/pictures/whole.jpg');

    await workflow.convert({ ...run, sessionId, mapping: mappedDraft() }, { onProgress: vi.fn() });

    expect(coversSent(ports)).toEqual([undefined, '/covers/pictures/two.jpg']);
  });

  it('gives the one book its cover: a loose CBZ, and a series bound as a single book', async () => {
    const ports = dependencies();
    const covers = memoryCovers();
    const workflow = workflowWith(ports, covers);
    const loose = await workflow.inspect(cbz);
    await workflow.covers.choose({ sessionId: loose.sessionId }, 'book', '/pictures/front.png');
    const series = await workflow.inspect(folder);
    await workflow.covers.choose({ sessionId: series.sessionId }, 'book', '/pictures/whole.png');
    await workflow.covers.choose({ sessionId: series.sessionId }, 1, '/pictures/one.png');

    await workflow.convert({ ...run, sessionId: loose.sessionId }, { onProgress: vi.fn() });
    await workflow.convert(
      { ...run, sessionId: series.sessionId, mapping: mappedDraft(), singleBook: true },
      { onProgress: vi.fn() },
    );

    expect(coversSent(ports)).toEqual(['/covers/pictures/front.png', '/covers/pictures/whole.png']);
  });

  it('asks for no cover when the run stops at the joined volumes', async () => {
    const ports = dependencies();
    const covers = memoryCovers();
    const list = vi.spyOn(covers.store, 'list');
    const workflow = workflowWith(ports, covers);
    const { sessionId } = await workflow.inspect(folder);
    await workflow.covers.choose({ sessionId }, 1, '/pictures/one.jpg');
    list.mockClear();

    await workflow.convert(
      { ...run, format: 'cbz', sessionId, mapping: mappedDraft(), mode: 'bind-only' },
      { onProgress: vi.fn() },
    );

    expect(list).not.toHaveBeenCalled();
    expect(ports.convert).not.toHaveBeenCalled();
  });

  it('gives each title of a library its own covers, by volume or for its single book', async () => {
    const ports = dependencies();
    const covers = memoryCovers();
    const { workflow, sessionId } = await openLibrary(ports, 1, covers.store);
    const good = { sessionId, title: 'Good Manga' };
    await workflow.covers.choose(good, 2, '/pictures/good-two.jpg');
    await workflow.covers.choose(good, 'book', '/pictures/good-whole.jpg');

    await workflow.convertLibrary({ ...run, sessionId }, { onProgress: vi.fn() });
    expect(coversSent(ports)).toEqual([undefined, '/covers/pictures/good-two.jpg']);

    ports.convert.mockClear();
    const again = await openLibrary(ports, 1, covers.store);
    await again.workflow.convertLibrary(
      { ...run, sessionId: again.sessionId, singleBook: true },
      { onProgress: vi.fn() },
    );
    expect(coversSent(ports)).toEqual(['/covers/pictures/good-whole.jpg']);
  });

  it('asks for no cover for a library whose volumes are only joined', async () => {
    const ports = dependencies();
    const covers = memoryCovers();
    const { workflow, sessionId } = await openLibrary(ports, 1, covers.store);
    await workflow.covers.choose({ sessionId, title: 'Good Manga' }, 1, '/pictures/one.jpg');
    const list = vi.spyOn(covers.store, 'list');

    await workflow.convertLibrary(
      { ...run, format: 'cbz', sessionId, mode: 'bind-only' },
      { onProgress: vi.fn() },
    );

    expect(list).not.toHaveBeenCalled();
  });
});
