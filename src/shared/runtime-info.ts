import type { ToolchainStatus } from './toolchain-status';

export interface RuntimeInfo {
  readonly electron: string;
  readonly platform: NodeJS.Platform;
}

export interface MangaboundBridge {
  readonly runtime: RuntimeInfo;
  readonly getToolchainStatus: () => Promise<ToolchainStatus>;
}
