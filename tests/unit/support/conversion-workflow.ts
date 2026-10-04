import { vi } from 'vitest';
import type { BookFileStorePort } from '@/application/ports/book-file-store';
import type { BindingPort, ConversionPort } from '@/application/ports/conversion-tools';
import type {
  CoverImage,
  CoverSourcePort,
  CoverStorePort,
  StoredCover,
} from '@/application/ports/cover-store';
import { isCoverImage } from '@/domain/book-covers';
import { ConversionWorkflow } from '@/application/workflows/conversion-workflow';
import type { ConversionArtifact, InputSelection } from '@/domain/conversion';
import { createMappingDraft, type MappingDraft } from '@/domain/mapping';

export const trustedDraft = createMappingDraft({
  mangaTitle: 'Trusted Manga',
  chapters: [
    { id: 'c1', name: 'Chapter 1', path: '/trusted/c1', pageCount: 2, chapter: 1 },
    { id: 'c2', name: 'Chapter 2', path: '/trusted/c2', pageCount: 3, chapter: 2 },
  ],
});

export function mappedDraft(overrides: Partial<MappingDraft> = {}): MappingDraft {
  return createMappingDraft({
    mangaTitle: overrides.mangaTitle ?? trustedDraft.mangaTitle,
    chapters: overrides.chapters ?? trustedDraft.chapters,
    source: overrides.source,
    volumes: overrides.volumes ?? [
      { id: 'v1', number: '1', chapterIds: ['c1'] },
      { id: 'v2', number: '2', chapterIds: ['c2'] },
    ],
  });
}

/** Volume files numbered from 1, the way mangabind reports them. */
export const numbered = (paths: readonly string[]) =>
  paths.map((path, index) => ({ number: index + 1, path }));

export function dependencies({
  volumePaths = ['/work/volume-1.cbz', '/work/volume-2.cbz'],
  combinedOutputPath = '/work/combined.cbz',
} = {}) {
  const bind = vi.fn<BindingPort['bind']>((_workspaceId, _mapping, _signal, singleBook) =>
    Promise.resolve({
      volumes: singleBook ? [] : numbered(volumePaths),
      combinedOutputPath: singleBook ? combinedOutputPath : undefined,
      issues: [],
    }),
  );
  const bindingPlan = vi.fn<BindingPort['plan']>(() =>
    Promise.resolve({
      title: 'Trusted Manga',
      volumes: [
        { name: 'Trusted Manga - Vol.01.cbz', pageCount: 2 },
        { name: 'Trusted Manga - Vol.02.cbz', pageCount: 3 },
      ],
      issues: [],
    }),
  );
  const inspect = vi.fn<BindingPort['inspect']>(() =>
    Promise.resolve({ workspaceId: 'workspace-1', draft: trustedDraft, issues: [] }),
  );
  const release = vi.fn<BindingPort['release']>(() => Promise.resolve());
  const convert = vi.fn<ConversionPort['convert']>((request, options) => {
    options.onProgress({
      stage: 'processing',
      message: 'Processed a page.',
      page: 1,
      completed: 1,
      total: 1,
    });
    const artifact: ConversionArtifact = {
      id: `artifact-${request.inputPath}`,
      name: `${request.inputPath.split('/').at(-1) ?? 'book'}.${request.format}`,
      path: `${request.outputDirectory}/book.${request.format}`,
      bytes: 100,
      format: request.format,
      title: 'Standalone',
      author: 'Unknown',
    };
    return Promise.resolve(artifact);
  });
  const conversionPlan = vi.fn<ConversionPort['plan']>(() =>
    Promise.resolve({
      title: 'Standalone',
      name: 'Standalone.epub',
      pageCount: 3,
      profile: 'KV',
      width: 1072,
      height: 1448,
    }),
  );
  const planBatch = vi.fn<BindingPort['planBatch']>(() =>
    Promise.resolve({
      titles: [
        {
          title: 'Good Manga',
          inputPath: '/library/Good Manga',
          status: 'completed',
          draft: trustedDraft,
          volumes: [{ name: 'Good Manga - Vol.01.cbz', pageCount: 2 }],
          issues: [],
        },
      ],
      issues: [],
    }),
  );
  const bindBatch = vi.fn<BindingPort['bindBatch']>((_inputPath, _signal, combine) =>
    Promise.resolve({
      workspaceId: 'batch-workspace',
      titles: [
        {
          title: 'Good Manga',
          status: 'completed',
          volumes: combine
            ? []
            : numbered(['/work/batch/good-vol-1.cbz', '/work/batch/good-vol-2.cbz']),
          combinedOutputPath: combine ? '/work/batch/good-combined.cbz' : undefined,
          issues: [],
        },
        {
          title: 'Broken Manga',
          status: 'failed',
          volumes: [],
          issues: [],
        },
      ],
      issues: [],
    }),
  );
  const writeTitleMapping = vi.fn<BindingPort['writeTitleMapping']>(() => Promise.resolve());
  const readDetails = vi.fn<BindingPort['readDetails']>(() => Promise.resolve({}));
  const writeDetails = vi.fn<BindingPort['writeDetails']>(() => Promise.resolve());
  const saveBook = vi.fn<BookFileStorePort['saveBook']>(({ sourcePath, libraryPath }) => {
    const name = sourcePath.split('/').at(-1) ?? 'volume.cbz';
    return Promise.resolve({ path: `${libraryPath}/${name}`, name, bytes: 1234 });
  });
  // Publishes under the name the tool gave the file, the way a library with no clash would.
  const stageBook: BookFileStorePort['stageBook'] = async (request, produce) => {
    const produced = await produce(`${request.libraryPath}/.mangabound/incoming/staged`);
    const name = produced.path.split('/').at(-1) ?? 'book';
    return { produced, saved: { path: `${request.libraryPath}/${name}`, name, bytes: 100 } };
  };
  return {
    binding: {
      bind,
      inspect,
      plan: bindingPlan,
      release,
      planBatch,
      bindBatch,
      writeTitleMapping,
      readDetails,
      writeDetails,
    } satisfies BindingPort,
    conversion: { convert, plan: conversionPlan } satisfies ConversionPort,
    bookFiles: { saveBook, stageBook } satisfies BookFileStorePort,
    saveBook,
    bind,
    bindingPlan,
    inspect,
    release,
    convert,
    conversionPlan,
    planBatch,
    bindBatch,
    writeTitleMapping,
    readDetails,
    writeDetails,
  };
}

export const folder: InputSelection = {
  inputPath: '/input/Trusted Manga',
  displayName: 'Trusted Manga',
  kind: 'folder',
};
export const cbz: InputSelection = {
  inputPath: '/input/Standalone.cbz',
  displayName: 'Standalone.cbz',
  kind: 'cbz',
};
export const library: InputSelection = {
  inputPath: '/input/Library',
  displayName: 'Library',
  kind: 'folder',
};
// Read as one manga, a library's manga folders are chapters that have no pages of their own.
export const libraryRead = createMappingDraft({
  mangaTitle: 'Library',
  chapters: [
    { id: 'l1', name: 'Good Manga', path: '/input/Library/Good Manga', pageCount: 0, chapter: 100 },
  ],
});

/** A workflow whose first input is a library, read the way mangabind reads one. */
export async function openLibrary(
  ports: ReturnType<typeof dependencies>,
  maxParallelConversions = 1,
  coverStore?: CoverStorePort & CoverSourcePort,
) {
  ports.inspect.mockResolvedValue({ workspaceId: 'workspace-1', draft: libraryRead, issues: [] });
  let id = 0;
  const workflow = new ConversionWorkflow(
    ports.binding,
    ports.conversion,
    () => `id-${String(++id)}`,
    ports.bookFiles,
    maxParallelConversions,
    ...(coverStore === undefined ? [] : [coverStore]),
  );
  const inspected = await workflow.inspect(library);
  return { workflow, sessionId: inspected.sessionId };
}

/**
 * Covers kept in memory, by item and book, the way the real store keeps them on disk. A path that
 * names a folder is given by `folders`: what it holds, as file names.
 */
export function memoryCovers(folders: Readonly<Record<string, readonly string[]>> = {}): {
  readonly store: CoverStorePort & CoverSourcePort;
  readonly kept: Map<string, StoredCover[]>;
} {
  const kept = new Map<string, StoredCover[]>();
  const nameOf = (filePath: string): string => filePath.split('/').at(-1) ?? filePath;
  const store: CoverStorePort & CoverSourcePort = {
    list: (itemPath) => Promise.resolve(kept.get(itemPath) ?? []),
    attach: (itemPath, cover) => {
      const others = (kept.get(itemPath) ?? []).filter((entry) => entry.slot !== cover.slot);
      kept.set(itemPath, [
        ...others,
        {
          slot: cover.slot,
          origin: cover.origin,
          name: nameOf(cover.sourcePath),
          path: `/covers${cover.sourcePath}`,
        },
      ]);
      return Promise.resolve();
    },
    remove: (itemPath, slot) => {
      kept.set(
        itemPath,
        (kept.get(itemPath) ?? []).filter((entry) => entry.slot !== slot),
      );
      return Promise.resolve();
    },
    imagesIn: (paths) =>
      Promise.resolve(
        paths.flatMap((candidate): CoverImage[] => {
          const inside = folders[candidate];
          if (inside !== undefined) {
            return inside.filter(isCoverImage).map((name) => ({
              path: `${candidate}/${name}`,
              name,
              readable: !name.includes('broken'),
            }));
          }
          return isCoverImage(nameOf(candidate))
            ? [
                {
                  path: candidate,
                  name: nameOf(candidate),
                  readable: !nameOf(candidate).includes('broken'),
                },
              ]
            : [];
        }),
      ),
  };
  return { store, kept };
}
