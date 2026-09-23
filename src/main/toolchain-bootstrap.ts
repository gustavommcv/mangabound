import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { app } from 'electron';

import { FsBookFileStore } from '@/adapters/library/fs-book-file-store';
import { MangabindBindingAdapter } from '@/adapters/mangabind/binding-port';
import { MangabindCliAdapter } from '@/adapters/mangabind/cli';
import { MangapressCliAdapter } from '@/adapters/mangapress/cli';
import { MangapressConversionAdapter } from '@/adapters/mangapress/conversion-port';
import { createNodeProcessRunner } from '@/adapters/process/node-process-runner';
import { verifyBundledToolchain } from '@/adapters/toolchain/verification';
import { SingleInputWorkflow } from '@/application/workflows/single-input';
import type { ToolchainStatus, ToolchainTarget } from '@/shared/toolchain-status';

import type { MainContext } from './context';

function executablePath(
  toolchainRoot: string,
  target: ToolchainTarget,
  tool: 'mangabind' | 'mangapress',
): string {
  const extension = target.startsWith('win32-') ? '.exe' : '';
  return path.join(toolchainRoot, target, `${tool}${extension}`);
}

/**
 * Verifies the bundled mangabind/mangapress binaries and, if they check out, constructs the
 * workflow onto the context so every IPC handler can reach it. Runs once, during app.whenReady().
 */
export async function bootstrapToolchain(
  context: Pick<MainContext, 'workflow' | 'mangapressCli'>,
): Promise<ToolchainStatus> {
  const toolchainRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'toolchain')
    : path.join(app.getAppPath(), 'vendor', 'toolchain');
  let toolchainStatus: ToolchainStatus;
  try {
    toolchainStatus = await verifyBundledToolchain({
      arch: process.arch,
      platform: process.platform,
      toolchainRoot,
    });
  } catch {
    toolchainStatus = {
      state: 'blocked',
      tools: [],
      message: 'The bundled-tool manifest could not be verified. Reinstall Mangabound.',
    };
  }
  if (toolchainStatus.state === 'ready' && toolchainStatus.target !== undefined) {
    const runner = createNodeProcessRunner();
    const mangabindCli = new MangabindCliAdapter(
      executablePath(toolchainRoot, toolchainStatus.target, 'mangabind'),
      runner,
    );
    context.mangapressCli = new MangapressCliAdapter(
      executablePath(toolchainRoot, toolchainStatus.target, 'mangapress'),
      runner,
    );
    context.workflow = new SingleInputWorkflow(
      new MangabindBindingAdapter(mangabindCli),
      new MangapressConversionAdapter(context.mangapressCli),
      randomUUID,
      new FsBookFileStore(),
    );
  }
  return toolchainStatus;
}
