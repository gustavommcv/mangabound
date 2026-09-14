import { buildMangabindArguments, type MangabindRunArguments } from './arguments';
import { parseMangabindReport, type MangabindReport } from './protocol';

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
  ) {}

  async run(
    request: MangabindRunArguments,
    options: ProcessRunOptions = {},
  ): Promise<MangabindRunResult> {
    const result = await this.processRunner.run(
      {
        executablePath: this.executablePath,
        arguments: buildMangabindArguments(request),
      },
      options,
    );
    return {
      report: parseMangabindReport(result.stdout),
      exitCode: result.exitCode,
      stderr: result.stderr,
    };
  }
}
