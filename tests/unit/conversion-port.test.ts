import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { MangapressCliAdapter, MangapressRunResult } from '@/adapters/mangapress/cli';
import { MangapressConversionAdapter } from '@/adapters/mangapress/conversion-port';
import {
  isMangapressResultEvent,
  parseMangapressEventLine,
  type MangapressErrorEvent,
  type MangapressEvent,
  type MangapressResultEvent,
} from '@/adapters/mangapress/protocol';
import { defaultMangapressSettings } from '@/domain/output-profile';

function event(fields: Record<string, unknown>): MangapressEvent {
  return parseMangapressEventLine(
    JSON.stringify({
      protocol_version: 1,
      tool: 'mangapress',
      tool_version: '0.5.0',
      sequence: 1,
      type: 'future',
      ...fields,
    }),
  );
}

function resultEvent(fields: Record<string, unknown> = {}): MangapressResultEvent {
  const parsed = event({
    type: 'result',
    status: 'completed',
    operation: 'convert',
    dry_run: false,
    manga: 'Book',
    format: 'epub',
    profile: 'KV',
    width: 1072,
    height: 1448,
    chapters: 1,
    source_pages: 1,
    output_pages: 1,
    output_path: path.resolve('/library', 'Book.epub'),
    bytes: 512,
    written: true,
    ...fields,
  });
  if (!isMangapressResultEvent(parsed)) throw new Error('Invalid result fixture.');
  return parsed;
}

function runResult(overrides: Partial<MangapressRunResult> = {}): MangapressRunResult {
  const result = resultEvent();
  return {
    events: overrides.events ?? [result],
    errors: overrides.errors ?? [],
    ...('result' in overrides ? { result: overrides.result } : { result }),
    exitCode: 'exitCode' in overrides ? (overrides.exitCode ?? null) : 0,
    stderr: overrides.stderr ?? '',
  };
}

const request = {
  inputPath: path.resolve('/input', 'Volume 01.cbz'),
  outputDirectory: path.resolve('/library'),
  settings: defaultMangapressSettings,
  format: 'epub' as const,
};

describe('mangapress conversion port', () => {
  it('maps streaming page and stage events into contextual progress and a library artifact', async () => {
    const run = vi.fn<MangapressCliAdapter['run']>((_request, options = {}) => {
      options.onEvent?.(event({ type: 'stage', stage: 'inspect', state: 'started' }));
      options.onEvent?.(
        event({
          type: 'page',
          stage: 'process',
          state: 'completed',
          chapter: 'Chapter 1',
          chapter_index: 1,
          page: 7,
          completed: 7,
          total: 10,
        }),
      );
      options.onEvent?.(event({ type: 'stage', stage: 'write', state: 'started' }));
      options.onEvent?.(event({ type: 'stage', stage: 'write', state: 'completed' }));
      options.onEvent?.(event({ type: 'future' }));
      return Promise.resolve(runResult());
    });
    const onProgress = vi.fn();
    const adapter = new MangapressConversionAdapter({ run }, () => 'artifact-id');
    const artifact = await adapter.convert(request, { onProgress });

    expect(artifact).toEqual({
      id: 'artifact-id',
      name: 'Book.epub',
      path: path.resolve('/library', 'Book.epub'),
      bytes: 512,
      format: 'epub',
    });
    expect(onProgress).toHaveBeenCalledWith({
      stage: 'processing',
      message: 'Processed page 7 of 10.',
      completed: 7,
      total: 10,
      chapter: 'Chapter 1',
      page: 7,
    });
    expect(onProgress).toHaveBeenCalledWith({
      stage: 'saving',
      message: 'Saving the finished book…',
    });
    expect(run.mock.calls[0]?.[0]).toMatchObject({
      profile: 'KV',
      cropping: 'margins-and-page-numbers',
      croppingPower: 1,
      croppingMinimum: 0,
      preserveMargin: 0,
      splitter: 'split',
      metadataTitle: 'series-only',
      language: 'en-US',
      dryRun: false,
      outputPath: request.outputDirectory,
    });
    expect(run.mock.calls[0]?.[1]?.signal).toBeUndefined();
  });

  it('passes cancellation through and reports complete structured failure context', async () => {
    const parsed = event({
      type: 'error',
      severity: 'error',
      code: 'page_processing_failed',
      stage: 'process',
      recoverable: true,
      message: "Couldn't process page 17.",
      diagnostic: 'decoder failed',
      manga: 'Work',
      volume: 2,
      chapter: 'Chapter 4',
      page: 17,
      path: '/input.cbz',
    });
    const error = parsed as MangapressErrorEvent;
    const run = vi.fn(() =>
      Promise.resolve(runResult({ exitCode: 1, errors: [error], result: undefined })),
    );
    const controller = new AbortController();
    const adapter = new MangapressConversionAdapter({ run });

    await expect(
      adapter.convert(request, { signal: controller.signal, onProgress: vi.fn() }),
    ).rejects.toMatchObject({
      exitCode: 1,
      issue: {
        tool: 'mangapress',
        code: 'page_processing_failed',
        diagnostic: 'decoder failed',
        manga: 'Work',
        volume: '2',
        chapter: 'Chapter 4',
        page: 17,
        path: '/input.cbz',
      },
    });
    expect(run).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('provides a safe fallback for failures without a structured error', async () => {
    const withDiagnostic = new MangapressConversionAdapter({
      run: () =>
        Promise.resolve(
          runResult({ exitCode: null, errors: [], result: undefined, stderr: 'technical detail' }),
        ),
    });
    await expect(withDiagnostic.convert(request, { onProgress: vi.fn() })).rejects.toMatchObject({
      issue: { code: 'process_failed', diagnostic: 'technical detail' },
    });

    const withoutDiagnostic = new MangapressConversionAdapter({
      run: () =>
        Promise.resolve(runResult({ exitCode: 1, errors: [], result: undefined, stderr: '' })),
    });
    await expect(withoutDiagnostic.convert(request, { onProgress: vi.fn() })).rejects.toMatchObject(
      {
        issue: { code: 'process_failed' },
      },
    );
  });

  it.each([
    { operation: 'list_profiles' },
    { written: false },
    { output_path: undefined },
    { bytes: undefined },
    { format: undefined },
  ])('rejects an incomplete successful conversion result: %j', async (fields) => {
    const incomplete = resultEvent(fields);
    const adapter = new MangapressConversionAdapter({
      run: () => Promise.resolve(runResult({ result: incomplete })),
    });

    await expect(adapter.convert(request, { onProgress: vi.fn() })).rejects.toThrow(/incomplete/u);
  });

  it('rejects outputs that are the library directory or outside it', async () => {
    for (const outputPath of [
      request.outputDirectory,
      path.resolve(request.outputDirectory, '..', 'outside.epub'),
    ]) {
      const adapter = new MangapressConversionAdapter({
        run: () => Promise.resolve(runResult({ result: resultEvent({ output_path: outputPath }) })),
      });
      await expect(adapter.convert(request, { onProgress: vi.fn() })).rejects.toThrow(/outside/u);
    }
  });

  it('omits absent optional fields when normalizing a structured error', async () => {
    const parsed = event({
      type: 'error',
      severity: 'error',
      code: 'input_empty',
      stage: 'inspect',
      recoverable: true,
      message: 'The input is empty.',
      diagnostic: 'empty',
    }) as MangapressErrorEvent;
    const adapter = new MangapressConversionAdapter({
      run: () => Promise.resolve(runResult({ exitCode: 1, errors: [parsed], result: undefined })),
    });

    await expect(adapter.convert(request, { onProgress: vi.fn() })).rejects.toMatchObject({
      issue: { code: 'input_empty' },
    });
  });
});
