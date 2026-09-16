import fs from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MangabindBindingAdapter,
  type WorkspaceFileSystem,
} from '@/adapters/mangabind/binding-port';
import type { MangabindCliAdapter, MangabindRunResult } from '@/adapters/mangabind/cli';
import { parseMangabindReport } from '@/adapters/mangabind/protocol';
import { createMappingDraft } from '@/domain/mapping';

const fixture = parseMangabindReport(
  fs.readFileSync(
    path.join(import.meta.dirname, '..', 'fixtures', 'protocol', 'mangabind-v1-plan.json'),
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

function fakeFiles(rootPath: string): WorkspaceFileSystem & {
  readonly createTemporaryDirectory: ReturnType<
    typeof vi.fn<WorkspaceFileSystem['createTemporaryDirectory']>
  >;
  readonly createDirectory: ReturnType<typeof vi.fn<WorkspaceFileSystem['createDirectory']>>;
  readonly writeText: ReturnType<typeof vi.fn<WorkspaceFileSystem['writeText']>>;
  readonly writeTextAtomically: ReturnType<
    typeof vi.fn<WorkspaceFileSystem['writeTextAtomically']>
  >;
  readonly removeDirectory: ReturnType<typeof vi.fn<WorkspaceFileSystem['removeDirectory']>>;
} {
  return {
    createTemporaryDirectory: vi.fn(() => Promise.resolve(rootPath)),
    createDirectory: vi.fn(() => Promise.resolve()),
    writeText: vi.fn(() => Promise.resolve()),
    writeTextAtomically: vi.fn(() => Promise.resolve()),
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
      run: vi.fn<MangabindCliAdapter['run']>((request) => {
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

    expect(inspection.draft.volumes).toEqual([]);
    expect(inspection.issues[0]).toMatchObject({ code: 'unassigned_chapter', chapter: '3' });
    const planned = await adapter.plan(
      inspection.workspaceId,
      completeMapping(),
      controller.signal,
    );
    expect(planned.volumes).toEqual([
      { name: 'planned-v1.cbz', pageCount: 2 },
      { name: 'planned-v2.cbz', pageCount: 1 },
    ]);
    expect(files.writeTextAtomically).not.toHaveBeenCalled();
    const bound = await adapter.bind(inspection.workspaceId, completeMapping(), controller.signal);
    expect(bound.volumePaths.map((volumePath) => path.basename(volumePath))).toEqual([
      'v1.cbz',
      'v2.cbz',
    ]);
    expect(bound.issues[0]).toMatchObject({ diagnostic: 'detail', volume: '1', chapter: '3' });
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
        "Couldn't save mangabind.json in the source folder. Check that the folder is writable and try again.",
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
    const adapter = new MangabindBindingAdapter(
      { run: () => Promise.resolve(result()) },
      undefined,
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
      run: vi.fn<MangabindCliAdapter['run']>(() =>
        Promise.resolve(result({ report, exitCode: 1 })),
      ),
    };
    const adapter = new MangabindBindingAdapter(cli, files, os.tmpdir(), () => 'batch-workspace');
    const controller = new AbortController();

    const bound = await adapter.bindBatch('/library', controller.signal);

    expect(cli.run).toHaveBeenCalledWith(
      expect.objectContaining({ inputPath: '/library', batch: true, dryRun: false }),
      { signal: controller.signal },
    );

    expect(bound.workspaceId).toBe('batch-workspace');
    expect(bound.titles[0]).toMatchObject({
      title: 'Good Manga',
      status: 'completed_with_warnings',
    });
    expect(bound.titles[0]!.volumePaths.map((volumePath) => path.basename(volumePath))).toEqual([
      'Good Manga - Vol.01.cbz',
      'Good Manga - Vol.02.cbz',
    ]);
    expect(bound.titles[1]).toMatchObject({ title: 'Broken Manga', status: 'failed' });
    expect(bound.titles[1]!.volumePaths).toEqual([]);
    // The workspace stays alive after a successful call — the caller releases it once done.
    expect(files.removeDirectory).not.toHaveBeenCalled();
    await adapter.release(bound.workspaceId);
    expect(files.removeDirectory).toHaveBeenCalledWith(path.resolve(root));
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
        "Couldn't save mangabind.json in the source folder. Check that the folder is writable and try again.",
    });
  });
});
