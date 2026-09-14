export type ToolName = 'mangabind' | 'mangapress';
export type ToolchainTarget = 'win32-x64' | 'linux-x64' | 'darwin-x64' | 'darwin-arm64';

export interface ToolVerificationStatus {
  readonly name: ToolName;
  readonly releaseTag: string;
  readonly state: 'ready' | 'failed';
  readonly message: string;
}

export interface ToolchainStatus {
  readonly state: 'ready' | 'blocked';
  readonly target?: ToolchainTarget;
  readonly tools: readonly ToolVerificationStatus[];
  readonly message: string;
}
