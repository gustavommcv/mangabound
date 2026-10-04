import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FsCoverStore } from '@/adapters/covers/fs-cover-store';

let work: string;
let root: string;
let pictures: string;
const item = '/manga/A Quiet Journey';

beforeEach(async () => {
  work = await mkdtemp(path.join(os.tmpdir(), 'mangabound-covers-'));
  root = path.join(work, 'covers');
  pictures = path.join(work, 'pictures');
  await mkdir(pictures);
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

async function picture(name: string, contents = name): Promise<string> {
  const filePath = path.join(pictures, name);
  await writeFile(filePath, contents);
  return filePath;
}

/** The one folder the store made for the item, and what is in it. */
async function itemFolder(): Promise<{ readonly directory: string; readonly files: string[] }> {
  const [name] = await readdir(root);
  const directory = path.join(root, name ?? 'missing');
  return { directory, files: (await readdir(directory)).sort() };
}

describe('covers kept as files of the app', () => {
  it('keeps nothing for an item no cover was ever attached to', async () => {
    const store = new FsCoverStore(root);

    await expect(store.list(item)).resolves.toEqual([]);
    // Removing what is not there is not an error, and makes no folder.
    await store.remove(item, 1);
    await expect(readdir(root)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('copies the image, so the original can be moved or deleted afterwards', async () => {
    const store = new FsCoverStore(root);
    const source = await picture('IMG_2041.JPG', 'the image');

    await store.attach(item, { slot: 2, origin: 'chosen', sourcePath: source });
    await rm(source);

    const [cover] = await store.list(item);
    expect(cover).toMatchObject({ slot: 2, name: 'IMG_2041.JPG', origin: 'chosen' });
    await expect(readFile(cover!.path, 'utf8')).resolves.toBe('the image');
    // Kept under the app's own folder, named for the book it is for, with the type it had.
    expect(path.dirname(path.dirname(cover!.path))).toBe(root);
    expect(path.basename(cover!.path)).toMatch(/^2-.+\.jpg$/u);
  });

  it('lists the one book first, then the volumes by number, whatever order they came in', async () => {
    const store = new FsCoverStore(root);
    for (const slot of [12, 'book', 3.5, 0, 1] as const) {
      await store.attach(item, {
        slot,
        origin: 'folder',
        sourcePath: await picture(`${String(slot)}.png`),
      });
    }

    const covers = await store.list(item);
    expect(covers.map((cover) => cover.slot)).toEqual(['book', 0, 1, 3.5, 12]);
    expect(covers.every((cover) => cover.origin === 'folder')).toBe(true);
  });

  it('replaces the cover a book had and leaves no file of the old one behind', async () => {
    const store = new FsCoverStore(root);
    await store.attach(item, { slot: 1, origin: 'folder', sourcePath: await picture('01.jpg') });
    await store.attach(item, { slot: 1, origin: 'chosen', sourcePath: await picture('mine.png') });

    await expect(store.list(item)).resolves.toMatchObject([
      { slot: 1, name: 'mine.png', origin: 'chosen' },
    ]);
    const { files } = await itemFolder();
    expect(files).toHaveLength(2);
    expect(files.filter((file) => file !== 'covers.json')).toEqual([
      expect.stringMatching(/^1-.+\.png$/u),
    ]);
  });

  it('keeps each item’s covers apart, by the item’s path', async () => {
    const store = new FsCoverStore(root);
    await store.attach(item, { slot: 1, origin: 'chosen', sourcePath: await picture('a.jpg') });
    await store.attach('/manga/Another', {
      slot: 1,
      origin: 'chosen',
      sourcePath: await picture('b.jpg'),
    });

    expect((await readdir(root)).length).toBe(2);
    await expect(store.list(item)).resolves.toMatchObject([{ name: 'a.jpg' }]);
    await expect(store.list('/manga/Another')).resolves.toMatchObject([{ name: 'b.jpg' }]);
    // The same item named another way is the same item.
    await expect(store.list('/manga/x/../A Quiet Journey')).resolves.toMatchObject([
      { name: 'a.jpg' },
    ]);
  });

  it('removes one cover and keeps the others, and removes the folder with the last', async () => {
    const store = new FsCoverStore(root);
    await store.attach(item, { slot: 1, origin: 'chosen', sourcePath: await picture('a.jpg') });
    await store.attach(item, { slot: 2, origin: 'chosen', sourcePath: await picture('b.jpg') });

    await store.remove(item, 1);
    await expect(store.list(item)).resolves.toMatchObject([{ slot: 2, name: 'b.jpg' }]);
    expect((await itemFolder()).files).toEqual([
      expect.stringMatching(/^2-.+\.jpg$/u),
      'covers.json',
    ]);

    await store.remove(item, 2);
    await expect(store.list(item)).resolves.toEqual([]);
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it('leaves out a cover whose image is gone', async () => {
    const store = new FsCoverStore(root);
    await store.attach(item, { slot: 1, origin: 'chosen', sourcePath: await picture('a.jpg') });
    await store.attach(item, { slot: 2, origin: 'chosen', sourcePath: await picture('b.jpg') });
    const [first] = await store.list(item);
    await rm(first!.path);

    await expect(store.list(item)).resolves.toMatchObject([{ slot: 2 }]);
  });

  it('reads an index it cannot use as no covers, and writes a good one over it', async () => {
    const store = new FsCoverStore(root);
    await store.attach(item, { slot: 1, origin: 'chosen', sourcePath: await picture('a.jpg') });
    const { directory } = await itemFolder();

    await writeFile(path.join(directory, 'covers.json'), '{ not json');
    await expect(store.list(item)).resolves.toEqual([]);
    await writeFile(path.join(directory, 'covers.json'), JSON.stringify({ version: 2 }));
    await expect(store.list(item)).resolves.toEqual([]);

    await store.attach(item, { slot: 3, origin: 'folder', sourcePath: await picture('c.jpg') });
    await expect(store.list(item)).resolves.toMatchObject([{ slot: 3, name: 'c.jpg' }]);
  });

  it('trusts only entries it could have written: a book’s key and a file of its own folder', async () => {
    const store = new FsCoverStore(root);
    await store.attach(item, { slot: 1, origin: 'chosen', sourcePath: await picture('a.jpg') });
    const { directory, files } = await itemFolder();
    const kept = files.find((file) => file !== 'covers.json')!;
    const outside = await picture('outside.jpg');
    const entry = { name: 'x.jpg', origin: 'chosen' };
    await writeFile(
      path.join(directory, 'covers.json'),
      JSON.stringify({
        version: 1,
        item,
        covers: {
          '1': { ...entry, file: kept },
          '02': { ...entry, file: kept },
          'volume 3': { ...entry, file: kept },
          '-1': { ...entry, file: kept },
          '4': { ...entry, file: outside },
          '5': { ...entry, file: path.join('..', 'elsewhere.jpg') },
        },
      }),
    );

    await expect(store.list(item)).resolves.toMatchObject([{ slot: 1 }]);
    // Replacing or removing such an entry never deletes the file it pointed at.
    await store.attach(item, { slot: 4, origin: 'chosen', sourcePath: await picture('new.jpg') });
    await store.remove(item, 5);
    await expect(readFile(outside, 'utf8')).resolves.toBe('outside.jpg');
  });

  it('leaves no copy behind when the index cannot be saved', async () => {
    const failing = new FsCoverStore(root, {
      rename: () => Promise.reject(new Error('disk full')),
    });

    await expect(
      failing.attach(item, { slot: 1, origin: 'chosen', sourcePath: await picture('a.jpg') }),
    ).rejects.toThrow('disk full');

    expect((await itemFolder()).files).toEqual([]);
    await expect(new FsCoverStore(root).list(item)).resolves.toEqual([]);
  });

  it('fails without a trace when the image cannot be copied', async () => {
    const store = new FsCoverStore(root);

    await expect(
      store.attach(item, {
        slot: 1,
        origin: 'chosen',
        sourcePath: path.join(pictures, 'gone.jpg'),
      }),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(store.list(item)).resolves.toEqual([]);
  });
});

describe('covers when a file of the app cannot be removed', () => {
  // A leftover file is not a cover: only what the index names is. So a failed clean-up never
  // turns a change that worked into an error, nor hides the error of one that did not.
  const cannotRemove = { rm: () => Promise.reject(new Error('busy')) };

  it('still replaces and removes a cover', async () => {
    const store = new FsCoverStore(root, cannotRemove);
    await store.attach(item, {
      slot: 'book',
      origin: 'folder',
      sourcePath: await picture('a.jpg'),
    });
    await store.attach(item, { slot: 1, origin: 'folder', sourcePath: await picture('b.jpg') });
    await store.attach(item, { slot: 1, origin: 'chosen', sourcePath: await picture('c.jpg') });

    await expect(store.list(item)).resolves.toMatchObject([
      { slot: 'book', name: 'a.jpg' },
      { slot: 1, name: 'c.jpg' },
    ]);

    await store.remove(item, 1);
    await expect(store.list(item)).resolves.toMatchObject([{ slot: 'book', name: 'a.jpg' }]);
  });

  it('still reports why the index could not be saved', async () => {
    const store = new FsCoverStore(root, {
      ...cannotRemove,
      rename: () => Promise.reject(new Error('disk full')),
    });

    await expect(
      store.attach(item, { slot: 1, origin: 'chosen', sourcePath: await picture('a.jpg') }),
    ).rejects.toThrow('disk full');
  });
});

describe('telling an image from a file that only has its name', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

  it('reads what a file begins with, not what it is called', async () => {
    const store = new FsCoverStore(root);
    await writeFile(path.join(pictures, 'real.png'), png);
    await writeFile(path.join(pictures, 'real-but-named-jpg.jpg'), png);
    await writeFile(path.join(pictures, 'garbage.png'), 'not an image at all');
    await writeFile(path.join(pictures, 'empty.jpg'), '');
    await writeFile(path.join(pictures, 'truncated.png'), png.subarray(0, 4));

    const images = await store.imagesIn([pictures]);

    expect(Object.fromEntries(images.map((image) => [image.name, image.readable]))).toEqual({
      'real.png': true,
      'real-but-named-jpg.jpg': true,
      'garbage.png': false,
      'empty.jpg': false,
      'truncated.png': false,
    });
  });

  it('reads an image named on its own the same way', async () => {
    const store = new FsCoverStore(root);
    const good = path.join(work, 'good.webp');
    const bad = path.join(work, 'bad.webp');
    await writeFile(
      good,
      Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]),
    );
    await writeFile(bad, 'RIFF but not a WebP');

    const images = await store.imagesIn([good, bad]);

    expect(images.map((image) => [image.name, image.readable])).toEqual([
      ['good.webp', true],
      ['bad.webp', false],
    ]);
  });

  it('takes a file it cannot open for one that cannot be read', async () => {
    const store = new FsCoverStore(root, {
      readHead: () => Promise.reject(new Error('EACCES')),
    });
    await picture('locked.jpg');

    const [image] = await store.imagesIn([pictures]);

    expect(image).toMatchObject({ name: 'locked.jpg', readable: false });
  });
});

describe('finding the images among what was picked or dropped', () => {
  it('takes the images directly inside a folder, and an image named on its own', async () => {
    const store = new FsCoverStore(root);
    await picture('02.png');
    await picture('01.jpg');
    await picture('notes.txt');
    await mkdir(path.join(pictures, 'deeper'));
    await writeFile(path.join(pictures, 'deeper', 'hidden.jpg'), '');
    const loose = path.join(work, 'loose.webp');
    await writeFile(loose, '');
    const text = path.join(work, 'readme.md');
    await writeFile(text, '');

    const images = await store.imagesIn([
      pictures,
      loose,
      text,
      path.join(work, 'missing.jpg'),
      path.join(work, 'missing-folder'),
    ]);

    expect(images.map((image) => image.name).sort()).toEqual(['01.jpg', '02.png', 'loose.webp']);
    expect(images.find((image) => image.name === '01.jpg')?.path).toBe(
      path.join(pictures, '01.jpg'),
    );
  });
});
