export type OpdsAuthConfig =
  | { readonly mode: 'token'; readonly token: string }
  | { readonly mode: 'basic'; readonly username: string; readonly password: string };

export interface OpdsServerHandle {
  readonly url: string;
  readonly interfaceAddress: string;
  readonly port: number;
  readonly authMode: 'token' | 'basic';
  readonly token?: string;
  stop(): Promise<void>;
}

export interface OpdsServerStartOptions {
  readonly libraryPath: string;
  readonly libraryTitle: string;
  readonly interfaceAddress: string;
  readonly auth: OpdsAuthConfig;
}

export interface OpdsServerPort {
  start(options: OpdsServerStartOptions): Promise<OpdsServerHandle>;
}
