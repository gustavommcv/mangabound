import { buildMangabindArguments, type MangabindRunArguments } from './arguments';
import {
  MangabindProgressDecoder,
  parseMangabindReport,
  type MangabindProgressEvent,
  type MangabindReport,
} from './protocol';

import type { ProcessRunner, ProcessRunOptions } from '@/application/ports/process-runner';

export interface MangabindRunResult {
  readonly report: MangabindReport;
  readonly exitCode: number | null;
  readonly stderr: string;
}

export class MangabindCliAdapter {
  constructor(
    private readonly executablePath: string,
    private readonly processRunner: ProcessRunner,
    private readonly supportsProgress = false,
  ) {}

  async run(
    request: MangabindRunArguments,
    options: ProcessRunOptions & {
      readonly onProgress?: (progress: MangabindProgressEvent) => void;
    } = {},
  ): Promise<MangabindRunResult> {
    const streamProgress = this.supportsProgress && options.onProgress !== undefined;
    const decoder = streamProgress ? new MangabindProgressDecoder() : undefined;
    const result = await this.processRunner.run(
      {
        executablePath: this.executablePath,
        arguments: buildMangabindArguments({ ...request, progressJson: streamProgress }),
      },
      {
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(decoder === undefined && options.onChunk === undefined
          ? {}
          : {
              onChunk: (chunk: { readonly stream: 'stdout' | 'stderr'; readonly text: string }) => {
                options.onChunk?.(chunk);
                if (chunk.stream === 'stderr') {
                  for (const event of decoder?.push(chunk.text) ?? []) options.onProgress?.(event);
                }
              },
            }),
      },
    );
    for (const event of decoder?.finish() ?? []) options.onProgress?.(event);
    return {
      report: parseMangabindReport(result.stdout),
      exitCode: result.exitCode,
      // In progress mode stderr is the machine side channel, not a diagnostic dump.
      stderr: streamProgress ? '' : result.stderr,
    };
  }
}
