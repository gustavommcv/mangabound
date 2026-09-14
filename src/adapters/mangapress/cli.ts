import { buildMangapressArguments, type MangapressRunArguments } from './arguments';
import {
  isMangapressErrorEvent,
  isMangapressProfileEvent,
  isMangapressResultEvent,
  type MangapressErrorEvent,
  type MangapressEvent,
  MangapressEventDecoder,
  type MangapressProfileEvent,
  type MangapressResultEvent,
} from './protocol';

import { CliProtocolError } from '@/adapters/cli-protocol-error';
import type { ProcessRunner } from '@/application/ports/process-runner';

export interface MangapressRunResult {
  readonly events: readonly MangapressEvent[];
  readonly errors: readonly MangapressErrorEvent[];
  readonly result?: MangapressResultEvent;
  readonly exitCode: number | null;
  readonly stderr: string;
}

export interface MangapressProfileList {
  readonly profiles: readonly MangapressProfileEvent[];
  readonly result: MangapressResultEvent;
}

export class MangapressCliAdapter {
  constructor(
    private readonly executablePath: string,
    private readonly processRunner: ProcessRunner,
  ) {}

  async run(
    request: MangapressRunArguments,
    {
      onEvent,
      signal,
    }: {
      readonly onEvent?: (event: MangapressEvent) => void;
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<MangapressRunResult> {
    return this.runEvents(buildMangapressArguments(request), { onEvent, signal });
  }

  async listProfiles(signal?: AbortSignal): Promise<MangapressProfileList> {
    const run = await this.runEvents(['--list-profiles', '--json-events'], { signal });
    if (run.exitCode !== 0 || run.result!.operation !== 'list_profiles') {
      throw new CliProtocolError(
        'invalid_payload',
        'mangapress could not return its device profiles.',
      );
    }
    return {
      profiles: run.events.filter(isMangapressProfileEvent),
      result: run.result!,
    };
  }

  private async runEvents(
    arguments_: readonly string[],
    {
      onEvent,
      signal,
    }: {
      readonly onEvent?: (event: MangapressEvent) => void;
      readonly signal?: AbortSignal;
    },
  ): Promise<MangapressRunResult> {
    const decoder = new MangapressEventDecoder();
    const events: MangapressEvent[] = [];
    const emit = (decoded: readonly MangapressEvent[]): void => {
      for (const event of decoded) {
        events.push(event);
        onEvent?.(event);
      }
    };
    const processResult = await this.processRunner.run(
      {
        executablePath: this.executablePath,
        arguments: arguments_,
      },
      {
        ...(signal === undefined ? {} : { signal }),
        onChunk: (chunk) => {
          if (chunk.stream === 'stdout') emit(decoder.push(chunk.text));
        },
      },
    );
    emit(decoder.finish());

    if (events.length === 0) {
      throw new CliProtocolError('empty_stream', 'mangapress returned no machine-readable events.');
    }
    const resultEvent = events.at(-1);
    const result =
      resultEvent !== undefined && isMangapressResultEvent(resultEvent) ? resultEvent : undefined;
    if (processResult.exitCode === 0 && result === undefined) {
      throw new CliProtocolError(
        'invalid_payload',
        'mangapress completed without a final result event.',
      );
    }

    return {
      events,
      errors: events.filter(isMangapressErrorEvent),
      ...(result === undefined ? {} : { result }),
      exitCode: processResult.exitCode,
      stderr: processResult.stderr,
    };
  }
}
