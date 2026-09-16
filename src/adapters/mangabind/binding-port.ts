import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { MangabindCliAdapter, MangabindRunResult } from './cli';
import { mappingDraftFromMangabindReport } from './mapping-draft';
import type { MangabindReport } from './protocol';

import type {
  BindingBatchPlan,
  BindingBatchResult,
  BindingInspection,
  BindingPlan,
  BindingPort,
  BindingResult,
} from '@/application/ports/conversion-tools';
import {
  ConversionWorkflowError,
  type PipelineIssue,
  ToolExecutionError,
} from '@/domain/conversion';
import { serializeMangabindMetadata } from '@/domain/mapping';

interface Workspace {
  readonly rootPath: string;
  readonly inputPath: string;
  readonly metadataPath: string;
  readonly volumesPath: string;
}

export interface WorkspaceFileSystem {
  readonly createTemporaryDirectory: (prefix: string) => Promise<string>;
  readonly createDirectory: (directoryPath: string) => Promise<void>;
  readonly writeText: (filePath: string, contents: string) => Promise<void>;
  readonly writeTextAtomically: (filePath: string, contents: string) => Promise<void>;
  readonly removeDirectory: (directoryPath: string) => Promise<void>;
}

const workspaceFileSystem: WorkspaceFileSystem = {
  createTemporaryDirectory: (prefix) => mkdtemp(prefix),
  createDirectory: (directoryPath) =>
    mkdir(directoryPath, { recursive: true }).then(() => undefined),
  writeText: (filePath, contents) => writeFile(filePath, contents, 'utf8'),
  writeTextAtomically: async (filePath, contents) => {
    const temporaryPath = `${filePath}.${String(process.pid)}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, contents, { encoding: 'utf8', flag: 'wx' });
      await rename(temporaryPath, filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  },
  removeDirectory: (directoryPath) => rm(directoryPath, { recursive: true, force: true }),
};

export class MangabindBindingAdapter implements BindingPort {
  private readonly workspaces = new Map<string, Workspace>();

  constructor(
    private readonly cli: Pick<MangabindCliAdapter, 'run'>,
    private readonly files: WorkspaceFileSystem = workspaceFileSystem,
    private readonly temporaryRoot = os.tmpdir(),
    private readonly createId: () => string = randomUUID,
  ) {}

  async inspect(inputPath: string, signal?: AbortSignal): Promise<BindingInspection> {
    const rootPath = await this.files.createTemporaryDirectory(
      path.join(this.temporaryRoot, 'mangabound-'),
    );
    const workspaceId = this.createId();
    const workspace = {
      rootPath,
      inputPath,
      metadataPath: path.join(rootPath, 'mangabind.json'),
      volumesPath: path.join(rootPath, 'volumes'),
    };
    this.workspaces.set(workspaceId, workspace);
    try {
      await this.files.createDirectory(workspace.volumesPath);
      const result = await this.cli.run(
        { inputPath, outputPath: workspace.volumesPath, dryRun: true },
        signal === undefined ? {} : { signal },
      );
      assertSuccessful(result);
      return {
        workspaceId,
        draft: mappingDraftFromMangabindReport(result.report, { seed: 'empty' }),
        issues: collectIssues(result),
      };
    } catch (error) {
      await this.release(workspaceId);
      throw error;
    }
  }

  async bind(
    workspaceId: string,
    mapping: Parameters<BindingPort['bind']>[1],
    signal?: AbortSignal,
  ): Promise<BindingResult> {
    const workspace = this.workspaces.get(workspaceId);
    if (workspace === undefined) {
      throw new Error('The temporary binding workspace is no longer available.');
    }
    const metadata = serializeMangabindMetadata(mapping);
    await this.files.writeText(workspace.metadataPath, metadata);
    try {
      await this.files.writeTextAtomically(
        path.join(workspace.inputPath, 'mangabind.json'),
        metadata,
      );
    } catch (error) {
      throw new ConversionWorkflowError(
        'mapping_save_failed',
        "Couldn't save mangabind.json in the source folder. Check that the folder is writable and try again.",
        { cause: error },
      );
    }
    const result = await this.cli.run(
      {
        inputPath: workspace.inputPath,
        outputPath: workspace.volumesPath,
        metadataFilePath: workspace.metadataPath,
        dryRun: false,
      },
      signal === undefined ? {} : { signal },
    );
    assertSuccessful(result);
    const volumePaths = result.report.manga
      .flatMap((manga) => manga.volumes)
      .filter((volume) => volume.written)
      .sort((left, right) => left.number - right.number)
      .map((volume) => checkedChildPath(workspace.volumesPath, volume.output_path));
    return { volumePaths, issues: collectIssues(result) };
  }

  async plan(
    workspaceId: string,
    mapping: Parameters<BindingPort['plan']>[1],
    signal?: AbortSignal,
  ): Promise<BindingPlan> {
    const workspace = this.workspaces.get(workspaceId);
    if (workspace === undefined) {
      throw new Error('The temporary binding workspace is no longer available.');
    }
    const metadata = serializeMangabindMetadata(mapping);
    await this.files.writeText(workspace.metadataPath, metadata);
    const result = await this.cli.run(
      {
        inputPath: workspace.inputPath,
        outputPath: workspace.volumesPath,
        metadataFilePath: workspace.metadataPath,
        dryRun: true,
      },
      signal === undefined ? {} : { signal },
    );
    assertSuccessful(result);
    const manga = result.report.manga[0];
    if (manga === undefined) throw new Error('Mangabind returned an incomplete plan.');
    const volumes = manga.volumes
      .slice()
      .sort((left, right) => left.number - right.number)
      .map((volume) => ({
        name: path.basename(checkedChildPath(workspace.volumesPath, volume.output_path)),
        pageCount: volume.page_count,
      }));
    return { title: manga.name, volumes, issues: collectIssues(result) };
  }

  async planBatch(parentPath: string, signal?: AbortSignal): Promise<BindingBatchPlan> {
    const rootPath = await this.files.createTemporaryDirectory(
      path.join(this.temporaryRoot, 'mangabound-'),
    );
    const scratchId = this.createId();
    const volumesPath = path.join(rootPath, 'volumes');
    this.workspaces.set(scratchId, {
      rootPath,
      inputPath: parentPath,
      metadataPath: path.join(rootPath, 'mangabind.json'),
      volumesPath,
    });
    try {
      await this.files.createDirectory(volumesPath);
      const result = await this.cli.run(
        { inputPath: parentPath, outputPath: volumesPath, dryRun: true, batch: true },
        signal === undefined ? {} : { signal },
      );
      return {
        titles: result.report.manga.map((manga, index) =>
          titleFromManga(manga, index, result.report, volumesPath),
        ),
        issues: result.report.issues.map(toPipelineIssue),
      };
    } finally {
      await this.release(scratchId);
    }
  }

  async bindBatch(parentPath: string, signal?: AbortSignal): Promise<BindingBatchResult> {
    const rootPath = await this.files.createTemporaryDirectory(
      path.join(this.temporaryRoot, 'mangabound-'),
    );
    const workspaceId = this.createId();
    const volumesPath = path.join(rootPath, 'volumes');
    this.workspaces.set(workspaceId, {
      rootPath,
      inputPath: parentPath,
      metadataPath: path.join(rootPath, 'mangabind.json'),
      volumesPath,
    });
    try {
      await this.files.createDirectory(volumesPath);
      const result = await this.cli.run(
        { inputPath: parentPath, outputPath: volumesPath, dryRun: false, batch: true },
        signal === undefined ? {} : { signal },
      );
      return {
        workspaceId,
        titles: result.report.manga.map((manga) => ({
          title: manga.name,
          status: manga.status,
          volumePaths: manga.volumes
            .filter((volume) => volume.written)
            .sort((left, right) => left.number - right.number)
            .map((volume) => checkedChildPath(volumesPath, volume.output_path)),
          issues: manga.issues.map(toPipelineIssue),
        })),
        issues: result.report.issues.map(toPipelineIssue),
      };
    } catch (error) {
      await this.release(workspaceId);
      throw error;
    }
  }

  async writeTitleMapping(
    inputPath: string,
    mapping: Parameters<BindingPort['bind']>[1],
  ): Promise<void> {
    const metadata = serializeMangabindMetadata(mapping);
    try {
      await this.files.writeTextAtomically(path.join(inputPath, 'mangabind.json'), metadata);
    } catch (error) {
      throw new ConversionWorkflowError(
        'mapping_save_failed',
        "Couldn't save mangabind.json in the source folder. Check that the folder is writable and try again.",
        { cause: error },
      );
    }
  }

  async release(workspaceId: string): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    this.workspaces.delete(workspaceId);
    if (workspace === undefined) return;
    const expectedPrefix = path.resolve(this.temporaryRoot) + path.sep;
    const resolved = path.resolve(workspace.rootPath);
    if (
      !resolved.startsWith(expectedPrefix) ||
      !path.basename(resolved).startsWith('mangabound-')
    ) {
      throw new Error('Refusing to remove an invalid temporary workspace path.');
    }
    await this.files.removeDirectory(resolved);
  }
}

function toPipelineIssue(issue: MangabindReport['issues'][number]): PipelineIssue {
  return {
    tool: 'mangabind',
    severity: issue.severity,
    code: issue.code,
    stage: issue.stage,
    recoverable: issue.recoverable,
    message: issue.message,
    ...(issue.diagnostic === undefined ? {} : { diagnostic: issue.diagnostic }),
    ...(issue.manga === undefined ? {} : { manga: issue.manga }),
    ...(issue.volume === undefined ? {} : { volume: String(issue.volume) }),
    ...(issue.chapter === undefined ? {} : { chapter: String(issue.chapter) }),
    ...(issue.path === undefined ? {} : { path: issue.path }),
  };
}

function collectIssues(result: MangabindRunResult): readonly PipelineIssue[] {
  return [...result.report.issues, ...result.report.manga.flatMap((manga) => manga.issues)].map(
    toPipelineIssue,
  );
}

function titleFromManga(
  manga: MangabindReport['manga'][number],
  index: number,
  report: MangabindReport,
  volumesPath: string,
): BindingBatchPlan['titles'][number] {
  return {
    title: manga.name,
    inputPath: manga.input_path,
    status: manga.status,
    draft: mappingDraftFromMangabindReport(report, { mangaIndex: index, seed: 'empty' }),
    volumes: manga.volumes
      .slice()
      .sort((left, right) => left.number - right.number)
      .map((volume) => ({
        name: path.basename(checkedChildPath(volumesPath, volume.output_path)),
        pageCount: volume.page_count,
      })),
    issues: manga.issues.map(toPipelineIssue),
  };
}

function assertSuccessful(result: MangabindRunResult): void {
  if (result.exitCode === 0 && result.report.status !== 'failed') return;
  const issue = collectIssues(result).find((candidate) => candidate.severity === 'error') ?? {
    tool: 'mangabind',
    severity: 'error',
    code: 'process_failed',
    stage: result.report.mode,
    recoverable: true,
    message: 'Mangabind could not build the selected volumes.',
    ...(result.stderr === '' ? {} : { diagnostic: result.stderr }),
  };
  throw new ToolExecutionError(issue, result.exitCode);
}

function checkedChildPath(parentPath: string, childPath: string): string {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  const parentUrl = pathToFileURL(`${parent}${path.sep}`).href;
  if (!pathToFileURL(child).href.startsWith(parentUrl)) {
    throw new Error('Mangabind reported an output outside its temporary workspace.');
  }
  return child;
}
