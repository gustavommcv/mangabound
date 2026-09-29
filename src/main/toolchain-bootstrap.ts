import { randomUUID } from 'node:crypto';
import { availableParallelism, totalmem } from 'node:os';
import path from 'node:path';

import { app } from 'electron';

import { FsBookFileStore } from '@/adapters/library/fs-book-file-store';
import { MangabindBindingAdapter } from '@/adapters/mangabind/binding-port';
import { MangabindCliAdapter } from '@/adapters/mangabind/cli';
import { MangapressCliAdapter } from '@/adapters/mangapress/cli';
import { MangapressConversionAdapter } from '@/adapters/mangapress/conversion-port';
import { createNodeProcessRunner } from '@/adapters/process/node-process-runner';
import {
  verifyBundledToolchain,
  verifyDevelopmentMangabind,
} from '@/adapters/toolchain/verification';
import { conversionConcurrency } from '@/application/workflows/conversion-concurrency';
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
    const target = toolchainStatus.target;
    const runner = createNodeProcessRunner();
    const localMangabind = app.isPackaged ? undefined : process.env.MANGABOUND_DEV_MANGABIND_PATH;
    let mangabindPath = executablePath(toolchainRoot, target, 'mangabind');
    let supportsProgress =
      toolchainStatus.tools
        .find((tool) => tool.name === 'mangabind')
        ?.capabilities?.includes('progress-json') === true;
    if (localMangabind !== undefined) {
      try {
        const local = await verifyDevelopmentMangabind(localMangabind);
        mangabindPath = localMangabind;
        supportsProgress = true;
        toolchainStatus = {
          ...toolchainStatus,
          tools: toolchainStatus.tools.map((tool) =>
            tool.name === 'mangabind'
              ? {
                  ...tool,
                  releaseTag: local.version,
                  capabilities: local.capabilities,
                  message: `Local development mangabind ${local.version} is active.`,
                }
              : tool,
          ),
          message: 'Local development mangabind is active; packaged tools remain unchanged.',
        };
        console.info(`Using local development mangabind: ${mangabindPath}`);
      } catch (error) {
        console.error('Could not use local development mangabind:', error);
        return {
          ...toolchainStatus,
          state: 'blocked',
          tools: toolchainStatus.tools.map((tool) =>
            tool.name === 'mangabind'
              ? {
                  ...tool,
                  state: 'failed',
                  message: 'Check MANGABOUND_DEV_MANGABIND_PATH and rebuild the local mangabind.',
                }
              : tool,
          ),
          message: 'The local development mangabind could not be verified.',
        };
      }
    }
    const mangabindCli = new MangabindCliAdapter(mangabindPath, runner, supportsProgress);
    context.mangapressCli = new MangapressCliAdapter(
      executablePath(toolchainRoot, target, 'mangapress'),
      runner,
    );
    context.workflow = new SingleInputWorkflow(
      new MangabindBindingAdapter(mangabindCli),
      new MangapressConversionAdapter(context.mangapressCli),
      randomUUID,
      new FsBookFileStore(),
      conversionConcurrency(availableParallelism(), totalmem()),
    );
  }
  return toolchainStatus;
}
