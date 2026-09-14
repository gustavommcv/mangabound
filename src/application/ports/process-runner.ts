export interface ProcessRequest {
  readonly executablePath: string;
  readonly arguments: readonly string[];
  readonly cwd?: string;
}

export interface ProcessChunk {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

export interface ProcessResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ProcessRunOptions {
  readonly signal?: AbortSignal;
  readonly onChunk?: (chunk: ProcessChunk) => void;
}

export interface ProcessRunner {
  run(request: ProcessRequest, options?: ProcessRunOptions): Promise<ProcessResult>;
}

export class ProcessCancelledError extends Error {
  constructor() {
    super('The conversion was cancelled.');
    this.name = 'ProcessCancelledError';
  }
}

export class ProcessStartError extends Error {
  constructor(cause: unknown) {
    super('The conversion tool could not be started.', { cause });
    this.name = 'ProcessStartError';
  }
}

export class ProcessOutputLimitError extends Error {
  constructor() {
    super('The conversion tool returned more diagnostic output than Mangabound can safely retain.');
    this.name = 'ProcessOutputLimitError';
  }
}
