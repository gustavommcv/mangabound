/** HTTP Basic credentials; both empty means the catalog requires no authentication (ADR 0018). */
export interface OpdsAuthConfig {
  readonly username: string;
  readonly password: string;
}

export interface OpdsServerHandle {
  readonly url: string;
  readonly interfaceAddress: string;
  readonly port: number;
  stop(): Promise<void>;
}

export interface OpdsServerStartOptions {
  readonly libraryPath: string;
  readonly libraryTitle: string;
  readonly interfaceAddress: string;
  /** 0 asks the OS for a free port; a caller that wants a stable address picks one itself. */
  readonly port: number;
  readonly auth: OpdsAuthConfig;
}

export interface OpdsServerPort {
  start(options: OpdsServerStartOptions): Promise<OpdsServerHandle>;
}
