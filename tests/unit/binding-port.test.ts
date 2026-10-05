import fs from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MangabindBindingAdapter,
  workspaceFileSystem,
  type WorkspaceFileSystem,
} from '@/adapters/mangabind/binding-port';
import type { MangabindCliAdapter, MangabindRunResult } from '@/adapters/mangabind/cli';
import { parseMangabindReport } from '@/adapters/mangabind/protocol';
import { createMappingDraft, unassignChapters } from '@/domain/mapping';

const fixture = parseMangabindReport(
  fs.readFileSync(
    path.join(import.meta.dirname, '..', 'fixtures', 'protocol', 'mangabind-v1-plan.json'),
    'utf8',
  ),
);
// A real mangabind 0.4.0 report for a folder like "Vol.01 Ch.0001 - Title (pt-br) [Group]".
const groupedFixture = parseMangabindReport(
  fs.readFileSync(
    path.join(import.meta.dirname, '..', 'fixtures', 'protocol', 'mangabind-v1-vol-ch-title.json'),
    'utf8',
  ),
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.promises.rm(directory, { force: true, recursive: true })),
  );
});

function result(
  overrides: Partial<MangabindRunResult> & {
    readonly report?: MangabindRunResult['report'];
  } = {},
): MangabindRunResult {
  return {
    report: overrides.report ?? structuredClone(fixture),
    exitCode: 'exitCode' in overrides ? (overrides.exitCode ?? null) : 0,
    stderr: overrides.stderr ?? '',
  };
}

/** The manga block of a mangabind.json's text. */
const mangaOf = (text: string): unknown => (JSON.parse(text) as { manga?: unknown }).manga;

function fakeFiles(rootPath: string): WorkspaceFileSystem & {
  readonly createTemporaryDirectory: ReturnType<
    typeof vi.fn<WorkspaceFileSystem['createTemporaryDirectory']>
  >;
  readonly createDirectory: ReturnType<typeof vi.fn<WorkspaceFileSystem['createDirectory']>>;
  readonly writeText: ReturnType<typeof vi.fn<WorkspaceFileSystem['writeText']>>;
  readonly writeTextAtomically: ReturnType<
    typeof vi.fn<WorkspaceFileSystem['writeTextAtomically']>
  >;
  readonly readText: ReturnType<typeof vi.fn<WorkspaceFileSystem['readText']>>;
  readonly removeFile: ReturnType<typeof vi.fn<WorkspaceFileSystem['removeFile']>>;
  readonly removeDirectory: ReturnType<typeof vi.fn<WorkspaceFileSystem['removeDirectory']>>;
} {
  return {
    createTemporaryDirectory: vi.fn(() => Promise.resolve(rootPath)),
    createDirectory: vi.fn(() => Promise.resolve()),
    writeText: vi.fn(() => Promise.resolve()),
    writeTextAtomically: vi.fn(() => Promise.resolve()),
    readText: vi.fn(() => Promise.resolve(undefined)),
    removeFile: vi.fn(() => Promise.resolve()),
    removeDirectory: vi.fn(() => Promise.resolve()),
  };
}

function batchReport(volumesPath: string): MangabindRunResult['report'] {
  const good = structuredClone(fixture.manga[0]!);
  good.name = 'Good Manga';
  good.input_path = '/library/Good Manga';
  good.status = 'completed_with_warnings';
  good.volumes = [
    {
      number: 2,
      output_path: path.join(volumesPath, 'Good Manga - Vol.02.cbz'),
      page_count: 1,
      chapters: ['Chapter 2'],
      written: true,
    },
    {
      number: 1,
      output_path: path.join(volumesPath, 'Good Manga - Vol.01.cbz'),
      page_count: 2,
      chapters: ['Chapter 1'],
      written: true,
    },
  ];

  const broken = structuredClone(fixture.manga[0]!);
  broken.name = 'Broken Manga';
  broken.input_path = '/library/Broken Manga';
  broken.status = 'failed';
  broken.volumes = [];
  broken.issues = [
    {
      tool: 'mangabind',
      severity: 'error',
      code: 'metadata_load_failed',
      stage: 'group',
      manga: 'Broken Manga',
      recoverable: true,
      message: 'mangabind.json could not be parsed.',
    },
  ];

  const report = structuredClone(fixture);
  report.batch = true;
  report.status = 'failed';
  report.manga = [good, broken];
  return report;
}

function completeMapping() {
  return createMappingDraft({
    mangaTitle: 'Mangá São José',
    chapters: [
      {
        id: '/fixtures/Mangá São José/Chapter 1',
        name: 'Chapter 1',
        path: '/trusted/1',
        pageCount: 2,
        chapter: 1,
      },
      {
        id: '/fixtures/Mangá São José/Chapter 3',
        name: 'Chapter 3',
        path: '/trusted/3',
        pageCount: 1,
        chapter: 3,
      },
    ],
    volumes: [
      {
        id: 'v1',
        number: '1',
        chapterIds: ['/fixtures/Mangá São José/Chapter 1', '/fixtures/Mangá São José/Chapter 3'],
      },
    ],
  });
}

describe('mangabind binding port', () => {
  it('owns a temporary workspace across inspect, bind, and release', async () => {
    const root = path.join(os.tmpdir(), 'tests', 'mangabound-workspace');
    const files = fakeFiles(root);
    const cli = {
      run: vi.fn<MangabindCliAdapter['run']>((request, options) => {
        const report = structuredClone(fixture);
        if (request.dryRun && request.metadataFilePath !== undefined) {
          report.status = 'completed';
          report.manga[0]!.volumes = [
            {
              number: 2,
              output_path: path.join(root, 'volumes', 'planned-v2.cbz'),
              page_count: 1,
              chapters: ['3'],
              written: false,
            },
            {
              number: 1,
              output_path: path.join(root, 'volumes', 'planned-v1.cbz'),
              page_count: 2,
              chapters: ['1'],
              written: false,
            },
          ];
        } else if (!request.dryRun) {
          options?.onProgress?.({
            protocol_version: 1,
            tool: 'mangabind',
            tool_version: 'test',
            kind: 'progress',
            stage: 'write',
            state: 'started',
            manga: 'Mangá São José',
            volume_index: 1,
            volume_count: 2,
            volume_number: 1,
            completed_pages: 0,
            total_pages: 3,
          });
          options?.onProgress?.({
            protocol_version: 1,
            tool: 'mangabind',
            tool_version: 'test',
            kind: 'progress',
            stage: 'write',
            state: 'advanced',
            manga: 'Mangá São José',
            volume_index: 1,
            volume_count: 2,
            volume_number: 1,
            completed_pages: 1,
            total_pages: 3,
          });
          report.mode = 'execute';
          report.status = 'completed';
          report.issues = [
            {
              tool: 'mangabind',
              severity: 'warning',
              code: 'detail',
              stage: 'write',
              recoverable: true,
              message: 'A warning.',
              diagnostic: 'detail',
              manga: 'Work',
              volume: 1,
              chapter: 3,
              path: '/source',
            },
          ];
          report.manga[0]!.volumes = [
            {
              number: 2,
              output_path: path.join(root, 'volumes', 'v2.cbz'),
              page_count: 1,
              chapters: ['3'],
              written: true,
            },
            {
              number: 1,
              output_path: path.join(root, 'volumes', 'v1.cbz'),
              page_count: 2,
              chapters: ['1'],
              written: true,
            },
            {
              number: 3,
              output_path: path.join(root, 'volumes', 'ignored.cbz'),
              page_count: 0,
              chapters: [],
              written: false,
            },
          ];
        }
        return Promise.resolve(result({ report }));
      }),
    };
    const adapter = new MangabindBindingAdapter(
      cli,
      files,
      path.join(os.tmpdir(), 'tests'),
      () => 'workspace',
    );
    const controller = new AbortController();
    const inspection = await adapter.inspect('/input/manga', controller.signal);

    // The editor opens on mangabind's own grouping, not an empty draft.
    expect(inspection.draft.volumes).toMatchObject([
      {
        id: 'effective-volume-1',
        number: '1',
        chapterIds: ['/fixtures/Mangá São José/Chapter 1'],
      },
    ]);
    expect(inspection.issues[0]).toMatchObject({ code: 'unassigned_chapter', chapter: '3' });
    const planned = await adapter.plan(
      inspection.workspaceId,
      completeMapping(),
      controller.signal,
    );
    expect(planned.volumes).toEqual([
      { name: 'planned-v1.cbz', pageCount: 2, number: 1 },
      { name: 'planned-v2.cbz', pageCount: 1, number: 2 },
    ]);
    expect(files.writeTextAtomically).not.toHaveBeenCalled();
    const onProgress = vi.fn();
    const bound = await adapter.bind(
      inspection.workspaceId,
      completeMapping(),
      controller.signal,
      false,
      onProgress,
    );
    expect(bound.volumes.map((volume) => [volume.number, path.basename(volume.path)])).toEqual([
      [1, 'v1.cbz'],
      [2, 'v2.cbz'],
    ]);
    expect(bound.issues[0]).toMatchObject({ diagnostic: 'detail', volume: '1', chapter: '3' });
    expect(onProgress).toHaveBeenCalledWith({
      stage: 'write',
      state: 'advanced',
      manga: 'Mangá São José',
      volumeIndex: 1,
      volumeCount: 2,
      completedPages: 1,
      totalPages: 3,
    });
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'started', completedPages: 0 }),
    );
    expect(files.writeText).toHaveBeenCalledWith(
      path.join(root, 'mangabind.json'),
      expect.stringContaining('"schema_version": 1'),
    );
    expect(files.writeTextAtomically).toHaveBeenCalledWith(
      path.join('/input/manga', 'mangabind.json'),
      expect.stringContaining('"schema_version": 1'),
    );
    await adapter.release(inspection.workspaceId);
    expect(files.removeDirectory).toHaveBeenCalledWith(path.resolve(root));
  });

  describe('binding the whole series into one combined volume', () => {
    function combinableAdapter(root: string, combinedOutputPath?: string) {
      const files = fakeFiles(root);
      const cli = {
        run: vi.fn<MangabindCliAdapter['run']>((request) => {
          const report = structuredClone(groupedFixture);
          if (!request.dryRun && request.combine === true) {
            report.mode = 'execute';
            report.manga[0]!.combined_output_path = combinedOutputPath;
            // A combined run still reports each volume's own chapters and number, just with no
            // file of its own - see mangabind's ADR 0012.
            report.manga[0]!.volumes = report.manga[0]!.volumes.map((volume) => ({
              ...volume,
              output_path: combinedOutputPath ?? volume.output_path,
              written: false,
            }));
          }
          return Promise.resolve(result({ report }));
        }),
      };
      const adapter = new MangabindBindingAdapter(cli, files, os.tmpdir(), () => 'combined');
      return { adapter, cli };
    }

    it('passes --combine and returns the one combined output path, not per-volume paths', async () => {
      const root = path.join(os.tmpdir(), 'mangabound-combine');
      const combinedPath = path.join(root, 'volumes', 'Chainsaw Man.cbz');
      const { adapter, cli } = combinableAdapter(root, combinedPath);

      const inspection = await adapter.inspect('/input/Chainsaw Man');
      const bound = await adapter.bind(inspection.workspaceId, inspection.draft, undefined, true);

      expect(bound.volumes).toEqual([]);
      expect(bound.combinedOutputPath).toBe(combinedPath);
      expect(cli.run).toHaveBeenLastCalledWith(expect.objectContaining({ combine: true }), {});
    });

    it('throws a clear error when a combined run reports no combined output path', async () => {
      const root = path.join(os.tmpdir(), 'mangabound-combine-missing');
      const { adapter } = combinableAdapter(root, undefined);

      const inspection = await adapter.inspect('/input/Chainsaw Man');
      await expect(
        adapter.bind(inspection.workspaceId, inspection.draft, undefined, true),
      ).rejects.toThrow(/did not report a combined output path/u);
    });
  });

  describe('a folder whose names already carry the volumes', () => {
    function groupedAdapter(root: string) {
      const files = fakeFiles(root);
      const cli = {
        run: vi.fn<MangabindCliAdapter['run']>((request) => {
          const report = structuredClone(groupedFixture);
          if (!request.dryRun) {
            report.mode = 'execute';
            report.manga[0]!.volumes = report.manga[0]!.volumes.map((volume) => ({
              ...volume,
              output_path: path.join(root, 'volumes', `v${String(volume.number)}.cbz`),
              written: true,
            }));
          }
          return Promise.resolve(result({ report }));
        }),
      };
      const adapter = new MangabindBindingAdapter(cli, files, os.tmpdir(), () => 'grouped');
      return { adapter, cli, files };
    }

    it('opens on mangabind grouping and does not write mangabind.json into the source folder for it', async () => {
      const root = path.join(os.tmpdir(), 'mangabound-unchanged-seed');
      const { adapter, cli, files } = groupedAdapter(root);

      const inspection = await adapter.inspect('/input/Chainsaw Man');
      expect(inspection.draft.volumes.map((volume) => volume.number)).toEqual(['1', '2']);
      const bound = await adapter.bind(inspection.workspaceId, inspection.draft);

      expect(bound.volumes.map((volume) => [volume.number, path.basename(volume.path)])).toEqual([
        [1, 'v1.cbz'],
        [2, 'v2.cbz'],
      ]);
      // The scratch copy is still what mangabind is run with; only the source-folder file is skipped.
      expect(files.writeText).toHaveBeenCalledWith(
        path.join(root, 'mangabind.json'),
        expect.stringContaining('"schema_version": 1'),
      );
      expect(cli.run).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dryRun: false,
          metadataFilePath: path.join(root, 'mangabind.json'),
        }),
        {},
      );
      expect(files.writeTextAtomically).not.toHaveBeenCalled();
    });

    it('does not treat a renamed volume id as a change', async () => {
      const root = path.join(os.tmpdir(), 'mangabound-renamed-ids');
      const { adapter, files } = groupedAdapter(root);

      const inspection = await adapter.inspect('/input/Chainsaw Man');
      const renamed = {
        ...inspection.draft,
        volumes: inspection.draft.volumes.map((volume) => ({
          ...volume,
          id: `other-${volume.id}`,
        })),
      };
      await adapter.bind(inspection.workspaceId, renamed);

      expect(files.writeTextAtomically).not.toHaveBeenCalled();
    });

    it('keeps the author and language of the file it replaces when the grouping is saved', async () => {
      const root = path.join(os.tmpdir(), 'mangabound-carried-details');
      const { adapter, files } = groupedAdapter(root);
      files.readText.mockResolvedValue(
        JSON.stringify({ schema_version: 1, manga: { author: 'Fujimoto Tatsuki' }, volumes: [] }),
      );

      const inspection = await adapter.inspect('/input/Chainsaw Man');
      const firstChapterId = inspection.draft.volumes[0]!.chapterIds[0]!;
      await adapter.bind(
        inspection.workspaceId,
        unassignChapters(inspection.draft, [firstChapterId]),
      );

      const written = files.writeTextAtomically.mock.calls.at(-1)?.[1] ?? '';
      expect(mangaOf(written)).toMatchObject({ author: 'Fujimoto Tatsuki' });
      // What mangabind itself is run with is the mapping alone.
      const scratch = files.writeText.mock.calls.at(-1)?.[1] ?? '';
      expect(mangaOf(scratch) ?? {}).not.toHaveProperty('author');
    });

    it('still saves mangabind.json once the user changes the grouping', async () => {
      const root = path.join(os.tmpdir(), 'mangabound-edited-seed');
      const { adapter, files } = groupedAdapter(root);

      const inspection = await adapter.inspect('/input/Chainsaw Man');
      const firstChapterId = inspection.draft.volumes[0]!.chapterIds[0]!;
      await adapter.bind(
        inspection.workspaceId,
        unassignChapters(inspection.draft, [firstChapterId]),
      );

      expect(files.writeTextAtomically).toHaveBeenCalledWith(
        path.join('/input/Chainsaw Man', 'mangabind.json'),
        expect.stringContaining('"schema_version": 1'),
      );
    });
  });

  it('cleans up an inspection whose process fails and preserves its structured issue', async () => {
    const root = path.join(os.tmpdir(), 'mangabound-failure');
    const files = fakeFiles(root);
    const report = structuredClone(fixture);
    report.status = 'failed';
    report.issues = [
      {
        tool: 'mangabind',
        severity: 'error',
        code: 'input_read_failed',
        stage: 'scan',
        recoverable: true,
        message: 'Could not inspect input.',
      },
    ];
    const adapter = new MangabindBindingAdapter(
      { run: () => Promise.resolve(result({ report, exitCode: 1 })) },
      files,
      os.tmpdir(),
      () => 'failed',
    );

    await expect(adapter.inspect('/input')).rejects.toMatchObject({
      issue: { code: 'input_read_failed', message: 'Could not inspect input.' },
    });
    expect(files.removeDirectory).toHaveBeenCalledOnce();
  });

  it('is no success when the report says it failed, even though the tool exited cleanly', async () => {
    const files = fakeFiles(path.join(os.tmpdir(), 'mangabound-failed-report'));
    const report = structuredClone(fixture);
    report.status = 'failed';
    const adapter = new MangabindBindingAdapter(
      { run: () => Promise.resolve(result({ report, exitCode: 0 })) },
      files,
      os.tmpdir(),
      () => 'failed-report',
    );

    await expect(adapter.inspect('/input')).rejects.toMatchObject({ exitCode: 0 });
  });

  it('uses an actionable fallback when a failed report has no structured error', async () => {
    const root = path.join(os.tmpdir(), 'mangabound-generic');
    const files = fakeFiles(root);
    const report = structuredClone(fixture);
    report.status = 'failed';
    report.issues = [];
    report.manga[0]!.issues = [];
    const adapter = new MangabindBindingAdapter(
      {
        run: () => Promise.resolve(result({ report, exitCode: null, stderr: 'technical detail' })),
      },
      files,
      os.tmpdir(),
      () => 'generic',
    );

    await expect(adapter.inspect('/input')).rejects.toMatchObject({
      exitCode: null,
      issue: { code: 'process_failed', diagnostic: 'technical detail' },
    });

    const noDiagnosticFiles = fakeFiles(path.join(os.tmpdir(), 'mangabound-no-diagnostic'));
    const noDiagnostic = new MangabindBindingAdapter(
      { run: () => Promise.resolve(result({ report, exitCode: 1, stderr: '' })) },
      noDiagnosticFiles,
      os.tmpdir(),
      () => 'no-diagnostic',
    );
    await expect(noDiagnostic.inspect('/input')).rejects.toMatchObject({
      issue: { code: 'process_failed' },
    });
  });

  it('reports an actionable error when the confirmed mapping cannot be persisted', async () => {
    const root = path.join(os.tmpdir(), 'mangabound-save-failure');
    const files = fakeFiles(root);
    files.writeTextAtomically.mockRejectedValue(new Error('read only'));
    const adapter = new MangabindBindingAdapter(
      { run: () => Promise.resolve(result()) },
      files,
      os.tmpdir(),
      () => 'save-failure',
    );

    await adapter.inspect('/input');
    await expect(adapter.bind('save-failure', completeMapping())).rejects.toMatchObject({
      code: 'mapping_save_failed',
      message:
        "Couldn't save mangabind.json in the source folder. Check that the folder is writable and that its mangabind.json is valid JSON.",
    });
  });

  it('rejects stale workspaces and output paths outside the owned directory', async () => {
    const root = path.join(os.tmpdir(), 'mangabound-path-check');
    const files = fakeFiles(root);
    const report = structuredClone(fixture);
    report.mode = 'execute';
    report.status = 'completed';
    report.manga[0]!.volumes = [
      {
        number: 1,
        output_path: path.join(root, 'volumes'),
        page_count: 1,
        chapters: ['1'],
        written: true,
      },
    ];
    const adapter = new MangabindBindingAdapter(
      { run: () => Promise.resolve(result({ report })) },
      files,
      os.tmpdir(),
      () => 'unsafe',
    );

    await expect(adapter.bind('missing', completeMapping())).rejects.toThrow(
      /no longer available/u,
    );
    await expect(adapter.plan('missing', completeMapping())).rejects.toThrow(
      /no longer available/u,
    );
    await adapter.inspect('/input');
    await expect(adapter.bind('unsafe', completeMapping())).rejects.toThrow(/outside/u);
    report.manga[0]!.volumes[0]!.output_path = path.join(root, '..', 'outside.cbz');
    await expect(adapter.bind('unsafe', completeMapping())).rejects.toThrow(/outside/u);
  });

  it('rejects an incomplete dry-run plan', async () => {
    const root = path.join(os.tmpdir(), 'mangabound-incomplete-plan');
    const files = fakeFiles(root);
    let invocation = 0;
    const adapter = new MangabindBindingAdapter(
      {
        run: () => {
          invocation += 1;
          const report = structuredClone(fixture);
          if (invocation === 2) report.manga = [];
          return Promise.resolve(result({ report }));
        },
      },
      files,
      os.tmpdir(),
      () => 'incomplete',
    );

    await adapter.inspect('/input');
    await expect(adapter.plan('incomplete', completeMapping())).rejects.toThrow(/incomplete/u);
  });

  it('refuses unsafe cleanup paths and treats repeated release as a no-op', async () => {
    const safeRoot = path.join(os.tmpdir(), 'safe-root');
    const files = fakeFiles(path.join(safeRoot, 'not-prefixed'));
    const adapter = new MangabindBindingAdapter(
      { run: () => Promise.resolve(result()) },
      files,
      safeRoot,
      () => 'bad-name',
    );
    await adapter.inspect('/input');
    await expect(adapter.release('bad-name')).rejects.toThrow(/Refusing/u);
    await adapter.release('bad-name');

    const outsideFiles = fakeFiles(path.join(safeRoot, '..', 'mangabound-outside'));
    const outside = new MangabindBindingAdapter(
      { run: () => Promise.resolve(result()) },
      outsideFiles,
      safeRoot,
      () => 'outside',
    );
    await outside.inspect('/input');
    await expect(outside.release('outside')).rejects.toThrow(/Refusing/u);
  });

  it('uses the real filesystem adapter for an isolated workspace', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-port-test-'));
    temporaryDirectories.push(root);
    let workspaceOutput = '';
    const cli = {
      run: vi.fn<MangabindCliAdapter['run']>((request) => {
        workspaceOutput = request.outputPath;
        const report = structuredClone(fixture);
        report.mode = request.dryRun ? 'plan' : 'execute';
        report.status = 'completed';
        report.manga[0]!.issues = [];
        report.manga[0]!.volumes = request.dryRun
          ? []
          : [
              {
                number: 1,
                output_path: path.join(request.outputPath, 'volume.cbz'),
                page_count: 3,
                chapters: ['1', '3'],
                written: true,
              },
            ];
        return Promise.resolve(result({ report }));
      }),
    };
    const input = path.join(root, 'input');
    await fs.promises.mkdir(input);
    const adapter = new MangabindBindingAdapter(cli, undefined, root, () => 'real');
    const inspection = await adapter.inspect(input);
    await adapter.bind(inspection.workspaceId, completeMapping());
    const savedMetadata = JSON.parse(
      await fs.promises.readFile(path.join(input, 'mangabind.json'), 'utf8'),
    ) as { schema_version: number };
    await adapter.release(inspection.workspaceId);

    expect(savedMetadata.schema_version).toBe(1);
    expect(fs.existsSync(path.dirname(workspaceOutput))).toBe(false);
  });

  it('removes an atomic-save temporary file when replacement fails', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-atomic-test-'));
    temporaryDirectories.push(root);
    const input = path.join(root, 'input');
    await fs.promises.mkdir(path.join(input, 'mangabind.json'), { recursive: true });
    // The folder is read as holding no file, so it is the replacement itself that fails.
    const adapter = new MangabindBindingAdapter(
      { run: () => Promise.resolve(result()) },
      { ...workspaceFileSystem, readText: () => Promise.resolve(undefined) },
      root,
      () => 'atomic-failure',
    );

    await adapter.inspect(input);
    await expect(adapter.bind('atomic-failure', completeMapping())).rejects.toMatchObject({
      code: 'mapping_save_failed',
    });
    expect((await fs.promises.readdir(input)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    await adapter.release('atomic-failure');
  });

  it('surfaces per-title status from a batch plan without gating on the top-level status', async () => {
    const root = path.join(os.tmpdir(), 'mangabound-batch-plan');
    const files = fakeFiles(root);
    const cli = {
      run: vi.fn<MangabindCliAdapter['run']>(() =>
        Promise.resolve(result({ report: batchReport(path.join(root, 'volumes')), exitCode: 1 })),
      ),
    };
    const adapter = new MangabindBindingAdapter(cli, files, os.tmpdir(), () => 'batch-plan');
    const controller = new AbortController();

    const plan = await adapter.planBatch('/library', controller.signal);

    expect(cli.run).toHaveBeenCalledWith(
      expect.objectContaining({ inputPath: '/library', batch: true, dryRun: true }),
      { signal: controller.signal },
    );

    expect(plan.titles).toHaveLength(2);
    expect(plan.titles[0]).toMatchObject({
      title: 'Good Manga',
      inputPath: '/library/Good Manga',
      status: 'completed_with_warnings',
      volumes: [
        { name: 'Good Manga - Vol.01.cbz', pageCount: 2 },
        { name: 'Good Manga - Vol.02.cbz', pageCount: 1 },
      ],
    });
    expect(plan.titles[1]).toMatchObject({
      title: 'Broken Manga',
      inputPath: '/library/Broken Manga',
      status: 'failed',
      volumes: [],
    });
    expect(plan.titles[1]!.issues[0]).toMatchObject({ code: 'metadata_load_failed' });
    // "Fix mapping" on a title opens on the grouping mangabind already found for it.
    expect(plan.titles[0]!.draft.volumes).toMatchObject([
      { id: 'effective-volume-1', number: '1', chapterIds: ['/fixtures/Mangá São José/Chapter 1'] },
    ]);
    // Cleans up its own scratch workspace regardless of the top-level status.
    expect(files.removeDirectory).toHaveBeenCalledWith(path.resolve(root));

    await adapter.planBatch('/library');
    expect(cli.run).toHaveBeenLastCalledWith(
      expect.objectContaining({ inputPath: '/library' }),
      {},
    );
  });

  it('returns volume paths for a successful batch title and isolates a failed one', async () => {
    const root = path.join(os.tmpdir(), 'mangabound-batch-bind');
    const files = fakeFiles(root);
    const report = batchReport(path.join(root, 'volumes'));
    report.mode = 'execute';
    const cli = {
      run: vi.fn<MangabindCliAdapter['run']>((_request, options) => {
        options?.onProgress?.({
          protocol_version: 1,
          tool: 'mangabind',
          tool_version: 'test',
          kind: 'progress',
          stage: 'inspect',
          state: 'started',
          manga: 'Good Manga',
        });
        return Promise.resolve(result({ report, exitCode: 1 }));
      }),
    };
    const adapter = new MangabindBindingAdapter(cli, files, os.tmpdir(), () => 'batch-workspace');
    const controller = new AbortController();

    const onProgress = vi.fn();
    const bound = await adapter.bindBatch('/library', controller.signal, false, onProgress);

    expect(cli.run).toHaveBeenCalledWith(
      expect.objectContaining({ inputPath: '/library', batch: true, dryRun: false }),
      expect.objectContaining({ signal: controller.signal }),
    );
    expect(cli.run.mock.calls[0]?.[1]?.onProgress).toEqual(expect.any(Function));
    expect(onProgress).toHaveBeenCalledWith({
      stage: 'inspect',
      state: 'started',
      manga: 'Good Manga',
    });

    expect(bound.workspaceId).toBe('batch-workspace');
    expect(bound.titles[0]).toMatchObject({
      title: 'Good Manga',
      status: 'completed_with_warnings',
    });
    expect(
      bound.titles[0]!.volumes.map((volume) => [volume.number, path.basename(volume.path)]),
    ).toEqual([
      [1, 'Good Manga - Vol.01.cbz'],
      [2, 'Good Manga - Vol.02.cbz'],
    ]);
    expect(bound.titles[1]).toMatchObject({ title: 'Broken Manga', status: 'failed' });
    expect(bound.titles[1]!.volumes).toEqual([]);
    // The workspace stays alive after a successful call — the caller releases it once done.
    expect(files.removeDirectory).not.toHaveBeenCalled();
    await adapter.release(bound.workspaceId);
    expect(files.removeDirectory).toHaveBeenCalledWith(path.resolve(root));
  });

  it('passes --combine to batch binding and returns combined output paths', async () => {
    const root = path.join(os.tmpdir(), 'mangabound-batch-combine');
    const files = fakeFiles(root);
    const report = batchReport(path.join(root, 'volumes'));
    report.mode = 'execute';
    report.manga[0]!.combined_output_path = path.join(root, 'volumes', 'Good Manga.cbz');
    report.manga[0]!.volumes = report.manga[0]!.volumes.map((v) => ({ ...v, written: false }));
    const cli = {
      run: vi.fn<MangabindCliAdapter['run']>(() => Promise.resolve(result({ report }))),
    };
    const adapter = new MangabindBindingAdapter(cli, files, os.tmpdir(), () => 'batch-combine');

    const bound = await adapter.bindBatch('/library', undefined, true);

    expect(cli.run).toHaveBeenCalledWith(
      expect.objectContaining({ inputPath: '/library', batch: true, combine: true, dryRun: false }),
      {},
    );
    expect(bound.titles[0]!.combinedOutputPath).toBe(path.join(root, 'volumes', 'Good Manga.cbz'));
    expect(bound.titles[0]!.volumes).toEqual([]);
  });

  describe('binding only some titles of a library', () => {
    /** The report of one title run on its own, as a run of that folder alone reports it. */
    function titleReport(volumesPath: string, name: string): MangabindRunResult['report'] {
      const report = batchReport(volumesPath);
      report.mode = 'execute';
      report.batch = false;
      const manga = report.manga[0]!;
      manga.name = name;
      manga.volumes = manga.volumes.map((volume) => ({
        ...volume,
        output_path: path.join(volumesPath, `${name} - Vol.0${String(volume.number)}.cbz`),
      }));
      report.manga = [manga];
      report.status = 'completed';
      return report;
    }

    it('runs mangabind once on each folder, not as a batch, into the one workspace', async () => {
      const root = path.join(os.tmpdir(), 'mangabound-titles');
      const files = fakeFiles(root);
      const volumesPath = path.join(root, 'volumes');
      const cli = {
        run: vi.fn<MangabindCliAdapter['run']>((request, options) => {
          const name = path.basename(request.inputPath);
          options?.onProgress?.({
            protocol_version: 1,
            tool: 'mangabind',
            tool_version: 'test',
            kind: 'progress',
            stage: 'inspect',
            state: 'started',
            manga: name,
          });
          const report = titleReport(volumesPath, name);
          report.issues = [
            {
              tool: 'mangabind',
              severity: 'warning',
              code: 'library_note',
              stage: 'inspect',
              recoverable: true,
              message: `About ${name}.`,
            },
          ];
          return Promise.resolve(result({ report }));
        }),
      };
      const adapter = new MangabindBindingAdapter(cli, files, os.tmpdir(), () => 'titles');
      const controller = new AbortController();
      const onProgress = vi.fn();

      const bound = await adapter.bindTitles(
        '/library',
        [path.join('/library', 'Alpha'), path.join('/library', 'Beta')],
        controller.signal,
        false,
        onProgress,
      );

      expect(cli.run).toHaveBeenCalledTimes(2);
      expect(cli.run).toHaveBeenNthCalledWith(
        1,
        {
          inputPath: path.join('/library', 'Alpha'),
          outputPath: volumesPath,
          dryRun: false,
          combine: false,
        },
        expect.objectContaining({ signal: controller.signal }),
      );
      expect(cli.run.mock.calls[1]?.[0]).toMatchObject({
        inputPath: path.join('/library', 'Beta'),
        outputPath: volumesPath,
      });
      expect(cli.run.mock.calls.map(([request]) => request.batch)).toEqual([undefined, undefined]);
      expect(onProgress.mock.calls.map(([event]) => (event as { manga: string }).manga)).toEqual([
        'Alpha',
        'Beta',
      ]);
      expect(bound.workspaceId).toBe('titles');
      expect(bound.titles.map((title) => title.title)).toEqual(['Alpha', 'Beta']);
      expect(
        bound.titles[1]!.volumes.map((volume) => [volume.number, path.basename(volume.path)]),
      ).toEqual([
        [1, 'Beta - Vol.01.cbz'],
        [2, 'Beta - Vol.02.cbz'],
      ]);
      expect(bound.issues.map((issue) => issue.message)).toEqual(['About Alpha.', 'About Beta.']);
      // The caller releases the workspace once the books are made.
      expect(files.removeDirectory).not.toHaveBeenCalled();
      await adapter.release(bound.workspaceId);
      expect(files.removeDirectory).toHaveBeenCalledWith(path.resolve(root));
    });

    it('asks for the series as one book, and runs nothing for no folder', async () => {
      const root = path.join(os.tmpdir(), 'mangabound-titles-combine');
      const volumesPath = path.join(root, 'volumes');
      const report = titleReport(volumesPath, 'Alpha');
      report.manga[0]!.combined_output_path = path.join(volumesPath, 'Alpha.cbz');
      const cli = {
        run: vi.fn<MangabindCliAdapter['run']>(() => Promise.resolve(result({ report }))),
      };
      const adapter = new MangabindBindingAdapter(
        cli,
        fakeFiles(root),
        os.tmpdir(),
        () => 'titles-combine',
      );

      const combined = await adapter.bindTitles('/library', ['/library/Alpha'], undefined, true);
      const none = await adapter.bindTitles('/library', []);

      expect(cli.run).toHaveBeenCalledExactlyOnceWith(
        { inputPath: '/library/Alpha', outputPath: volumesPath, dryRun: false, combine: true },
        {},
      );
      expect(combined.titles[0]!.combinedOutputPath).toBe(path.join(volumesPath, 'Alpha.cbz'));
      expect(none).toMatchObject({ titles: [], issues: [] });
    });

    it('releases the workspace when one of the runs fails, and runs no further', async () => {
      const root = path.join(os.tmpdir(), 'mangabound-titles-crash');
      const files = fakeFiles(root);
      const cli = {
        run: vi.fn<MangabindCliAdapter['run']>(() => Promise.reject(new Error('spawn failed'))),
      };
      const adapter = new MangabindBindingAdapter(cli, files, os.tmpdir(), () => 'titles-crash');

      await expect(
        adapter.bindTitles('/library', ['/library/Alpha', '/library/Beta']),
      ).rejects.toThrow('spawn failed');

      expect(cli.run).toHaveBeenCalledTimes(1);
      expect(files.removeDirectory).toHaveBeenCalledWith(path.resolve(root));
    });
  });

  it('releases the batch workspace when the process itself fails', async () => {
    const root = path.join(os.tmpdir(), 'mangabound-batch-crash');
    const files = fakeFiles(root);
    const adapter = new MangabindBindingAdapter(
      { run: () => Promise.reject(new Error('spawn failed')) },
      files,
      os.tmpdir(),
      () => 'batch-crash',
    );

    await expect(adapter.bindBatch('/library')).rejects.toThrow('spawn failed');
    expect(files.removeDirectory).toHaveBeenCalledWith(path.resolve(root));
  });

  it('writes a title mapping directly into the manga folder without invoking the CLI', async () => {
    const files = fakeFiles(path.join(os.tmpdir(), 'unused'));
    const cli = { run: vi.fn<MangabindCliAdapter['run']>() };
    const adapter = new MangabindBindingAdapter(cli, files, os.tmpdir(), () => 'unused');

    await adapter.writeTitleMapping('/library/Good Manga', completeMapping());

    expect(cli.run).not.toHaveBeenCalled();
    expect(files.writeTextAtomically).toHaveBeenCalledWith(
      path.join('/library/Good Manga', 'mangabind.json'),
      expect.stringContaining('"schema_version": 1'),
    );
  });

  it('keeps the author and language of a title folder when its mapping is saved', async () => {
    const files = fakeFiles(path.join(os.tmpdir(), 'unused'));
    files.readText.mockResolvedValue(
      JSON.stringify({ schema_version: 1, manga: { author: 'Someone', language: 'pt-br' } }),
    );
    const adapter = new MangabindBindingAdapter(
      { run: vi.fn<MangabindCliAdapter['run']>() },
      files,
      os.tmpdir(),
      () => 'unused',
    );

    await adapter.writeTitleMapping('/library/Good Manga', completeMapping());

    const written = files.writeTextAtomically.mock.calls.at(-1)?.[1] ?? '';
    expect(mangaOf(written)).toMatchObject({ author: 'Someone', language: 'pt-br' });
    expect(files.readText).toHaveBeenCalledWith(path.join('/library/Good Manga', 'mangabind.json'));
  });

  it('reports an actionable error when a title mapping cannot be persisted', async () => {
    const files = fakeFiles(path.join(os.tmpdir(), 'unused'));
    files.writeTextAtomically.mockRejectedValue(new Error('read only'));
    const adapter = new MangabindBindingAdapter(
      { run: () => Promise.resolve(result()) },
      files,
      os.tmpdir(),
      () => 'unused',
    );

    await expect(
      adapter.writeTitleMapping('/library/Good Manga', completeMapping()),
    ).rejects.toMatchObject({
      code: 'mapping_save_failed',
      message:
        "Couldn't save mangabind.json in the source folder. Check that the folder is writable and that its mangabind.json is valid JSON.",
    });
  });
});

describe('the author and language kept with a folder', () => {
  const folder = path.join('/library', 'Good Manga');
  const file = path.join(folder, 'mangabind.json');
  const adapterWith = (files: ReturnType<typeof fakeFiles>) =>
    new MangabindBindingAdapter(
      { run: vi.fn<MangabindCliAdapter['run']>() },
      files,
      os.tmpdir(),
      () => 'unused',
    );

  describe('read when a folder is read', () => {
    it('are what its mangabind.json holds under manga', async () => {
      const files = fakeFiles('unused');
      files.readText.mockResolvedValue(
        JSON.stringify({ manga: { author: 'Fujimoto Tatsuki', language: 'pt-br' } }),
      );

      await expect(adapterWith(files).readDetails(folder)).resolves.toEqual({
        author: 'Fujimoto Tatsuki',
        language: 'pt-br',
      });
      expect(files.readText).toHaveBeenCalledWith(file);
    });

    it('are none when there is no file, it holds none, or it cannot be read', async () => {
      const files = fakeFiles('unused');
      const adapter = adapterWith(files);

      await expect(adapter.readDetails(folder)).resolves.toEqual({});

      files.readText.mockResolvedValue('{"volumes": []}');
      await expect(adapter.readDetails(folder)).resolves.toEqual({});

      files.readText.mockRejectedValue(new Error('permission denied'));
      await expect(adapter.readDetails(folder)).resolves.toEqual({});
    });
  });

  describe('kept when a page is left', () => {
    it('start a file when the folder has none', async () => {
      const files = fakeFiles('unused');

      await adapterWith(files).writeDetails(folder, { title: 'not kept', author: 'Someone' });

      expect(files.writeTextAtomically).toHaveBeenCalledOnce();
      const [target, text] = files.writeTextAtomically.mock.calls[0] ?? [];
      expect(target).toBe(file);
      expect(JSON.parse(text ?? '')).toEqual({
        schema_version: 1,
        manga: { author: 'Someone' },
        volumes: [],
      });
      expect(files.removeFile).not.toHaveBeenCalled();
    });

    it('are added to the file a folder already has, leaving the rest as it was', async () => {
      const files = fakeFiles('unused');
      files.readText.mockResolvedValue(
        JSON.stringify({
          schema_version: 1,
          manga: { title: 'Good Manga' },
          volumes: [{ number: '1', chapters: ['1'] }],
        }),
      );

      await adapterWith(files).writeDetails(folder, { author: 'Someone', language: 'ja' });

      const written = files.writeTextAtomically.mock.calls[0]?.[1] ?? '';
      expect(JSON.parse(written)).toEqual({
        schema_version: 1,
        manga: { title: 'Good Manga', author: 'Someone', language: 'ja' },
        volumes: [{ number: '1', chapters: ['1'] }],
      });
    });

    it('take the file away when they were all it held and are cleared', async () => {
      const files = fakeFiles('unused');
      files.readText.mockResolvedValue(
        JSON.stringify({ schema_version: 1, manga: { author: 'Someone' }, volumes: [] }),
      );

      await adapterWith(files).writeDetails(folder, {});

      expect(files.removeFile).toHaveBeenCalledExactlyOnceWith(file);
      expect(files.writeTextAtomically).not.toHaveBeenCalled();
    });

    it('touch nothing when there is nothing to keep and no file', async () => {
      const files = fakeFiles('unused');

      await adapterWith(files).writeDetails(folder, {});

      expect(files.writeTextAtomically).not.toHaveBeenCalled();
      expect(files.removeFile).not.toHaveBeenCalled();
    });

    it.each([
      [
        'the file cannot be read',
        (files: ReturnType<typeof fakeFiles>) =>
          files.readText.mockRejectedValue(new Error('denied')),
      ],
      [
        'the file is not valid JSON',
        (files: ReturnType<typeof fakeFiles>) => files.readText.mockResolvedValue('not json'),
      ],
      [
        'the folder cannot be written to',
        (files: ReturnType<typeof fakeFiles>) =>
          files.writeTextAtomically.mockRejectedValue(new Error('read only')),
      ],
    ])('are reported as not saved when %s', async (_case, arrange) => {
      const files = fakeFiles('unused');
      arrange(files);

      await expect(
        adapterWith(files).writeDetails(folder, { author: 'Someone' }),
      ).rejects.toMatchObject({
        code: 'details_save_failed',
        message: expect.stringContaining('Check that the folder is writable') as string,
      });
    });

    it('report a file that could not be taken away as not saved', async () => {
      const files = fakeFiles('unused');
      files.readText.mockResolvedValue(
        JSON.stringify({ schema_version: 1, manga: { author: 'A' }, volumes: [] }),
      );
      files.removeFile.mockRejectedValue(new Error('in use'));

      await expect(adapterWith(files).writeDetails(folder, {})).rejects.toMatchObject({
        code: 'details_save_failed',
      });
    });
  });

  describe('on the real file system', () => {
    async function realFolder(): Promise<string> {
      const folder = await mkdtemp(path.join(os.tmpdir(), 'mangabound-kept-details-'));
      folders.push(folder);
      return folder;
    }
    const folders: string[] = [];
    afterEach(async () => {
      const { rm } = await import('node:fs/promises');
      await Promise.all(
        folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
      );
    });
    const real = () => new MangabindBindingAdapter({ run: vi.fn<MangabindCliAdapter['run']>() });

    it('keeps, finds again and takes away the details of a folder', async () => {
      const adapter = real();
      const folder = await realFolder();
      const file = path.join(folder, 'mangabind.json');

      await expect(adapter.readDetails(folder)).resolves.toEqual({});
      await adapter.writeDetails(folder, { author: 'Someone', language: 'pt-br' });
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
        schema_version: 1,
        manga: { author: 'Someone', language: 'pt-BR' },
        volumes: [],
      });
      await expect(adapter.readDetails(folder)).resolves.toEqual({
        author: 'Someone',
        language: 'pt-BR',
      });

      await adapter.writeDetails(folder, {});
      expect(fs.existsSync(file)).toBe(false);
      // Nothing left to take away is not an error.
      await adapter.writeDetails(folder, {});
    });

    it('find nothing where the folder is missing or its mangabind.json cannot be read', async () => {
      const adapter = real();
      const folder = await realFolder();

      await expect(adapter.readDetails(path.join(folder, 'not there'))).resolves.toEqual({});
      // A directory where the file should be cannot be read as one, and is not a reason to fail.
      fs.mkdirSync(path.join(folder, 'mangabind.json'));
      await expect(adapter.readDetails(folder)).resolves.toEqual({});
      await expect(adapter.writeDetails(folder, { author: 'Someone' })).rejects.toMatchObject({
        code: 'details_save_failed',
      });
    });
  });
});
