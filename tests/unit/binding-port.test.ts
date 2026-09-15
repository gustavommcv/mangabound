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
        if (!request.dryRun) {
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
    await adapter.inspect('/input');
    await expect(adapter.bind('unsafe', completeMapping())).rejects.toThrow(/outside/u);
    report.manga[0]!.volumes[0]!.output_path = path.join(root, '..', 'outside.cbz');
    await expect(adapter.bind('unsafe', completeMapping())).rejects.toThrow(/outside/u);
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
});
