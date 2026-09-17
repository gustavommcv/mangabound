import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

const fixtureRoot = path.resolve('tests', 'fixtures', 'e2e', 'manga-folder', 'Mangabound E2E');
const width = 600;
const height = 800;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(name, data) {
  const type = Buffer.from(name, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, checksum]);
}

function image(seed) {
  const scanlines = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 3;
      const panel = ((Math.floor(x / 100) + Math.floor(y / 100) + seed) & 1) * 150;
      const line = x % 89 < 3 || y % 113 < 3 ? 20 : panel + 65;
      scanlines[offset] = line;
      scanlines[offset + 1] = Math.max(0, line - seed * 4);
      scanlines[offset + 2] = Math.min(255, line + seed * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function zip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const checksum = crc32(entry.contents);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(entry.contents.length, 18);
    localHeader.writeUInt32LE(entry.contents.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, entry.contents);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(entry.contents.length, 20);
    centralHeader.writeUInt32LE(entry.contents.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + entry.contents.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

for (let chapter = 1; chapter <= 2; chapter += 1) {
  const chapterPath = path.join(fixtureRoot, `Chapter ${String(chapter)}`);
  await mkdir(chapterPath, { recursive: true });
  for (let page = 1; page <= 2; page += 1) {
    await writeFile(
      path.join(chapterPath, `${String(page).padStart(3, '0')}.png`),
      image(chapter * 2 + page),
    );
  }
}

const cbzRoot = path.resolve('tests', 'fixtures', 'e2e', 'cbz');
await mkdir(cbzRoot, { recursive: true });
await writeFile(
  path.join(cbzRoot, 'Mangabound Direct.cbz'),
  zip([
    { name: 'Chapter 1/001.png', contents: image(7) },
    { name: 'Chapter 1/002.png', contents: image(8) },
  ]),
);

const batchLibraryRoot = path.resolve('tests', 'fixtures', 'e2e', 'manga-batch', 'Library');
// Volume-in-name chapters: mangabind auto-resolves these into one volume, even under --batch.
for (let chapter = 1; chapter <= 2; chapter += 1) {
  const chapterPath = path.join(
    batchLibraryRoot,
    'Auto-Resolved Manga',
    `Volume 1 Chapter ${String(chapter)}`,
  );
  await mkdir(chapterPath, { recursive: true });
  for (let page = 1; page <= 2; page += 1) {
    await writeFile(
      path.join(chapterPath, `${String(page).padStart(3, '0')}.png`),
      image(chapter * 2 + page + 10),
    );
  }
}
// Plain chapter-only names: mangabind can't infer a volume without a mangabind.json,
// even under --batch, so this manga needs the "Fix mapping" flow.
for (let chapter = 1; chapter <= 2; chapter += 1) {
  const chapterPath = path.join(
    batchLibraryRoot,
    'Needs Mapping Manga',
    `Chapter ${String(chapter)}`,
  );
  await mkdir(chapterPath, { recursive: true });
  for (let page = 1; page <= 2; page += 1) {
    await writeFile(
      path.join(chapterPath, `${String(page).padStart(3, '0')}.png`),
      image(chapter * 2 + page + 20),
    );
  }
}

console.log(`Generated copyright-safe E2E fixture at ${fixtureRoot}`);
console.log(`Generated copyright-safe batch E2E fixture at ${batchLibraryRoot}`);
