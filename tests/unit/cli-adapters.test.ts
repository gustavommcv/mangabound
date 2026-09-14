import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { MangabindCliAdapter } from '@/adapters/mangabind/cli';
import { MangapressCliAdapter } from '@/adapters/mangapress/cli';
import { isMangapressErrorEvent, parseMangapressEventLine } from '@/adapters/mangapress/protocol';
import type { ProcessRunner } from '@/application/ports/process-runner';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const mangabindFixture = fs.readFileSync(
  path.join(repositoryRoot, 'tests', 'fixtures', 'protocol', 'mangabind-v1-plan.json'),
  'utf8',
);
const mangapressFixture = fs.readFileSync(
  path.join(repositoryRoot, 'tests', 'fixtures', 'protocol', 'mangapress-v1-events.jsonl'),
  'utf8',
);

function runnerReturning(
  stdout: string,
  exitCode = 0,
  stderr = '',
): {
  readonly runner: ProcessRunner;
  readonly run: ReturnType<typeof vi.fn<ProcessRunner['run']>>;
} {
  const run = vi.fn<ProcessRunner['run']>((_request, options) => {
    options?.onChunk?.({ stream: 'stderr', text: stderr });
    const midpoint = Math.floor(stdout.length / 2);
    options?.onChunk?.({ stream: 'stdout', text: stdout.slice(0, midpoint) });
    options?.onChunk?.({ stream: 'stdout', text: stdout.slice(midpoint) });
    return Promise.resolve({ stdout, stderr, exitCode, signal: null });
  });
  return { runner: { run }, run };
}

describe('CLI process adapters', () => {
  it('runs mangabind with deterministic plan arguments and parses its real fixture', async () => {
    const runner = runnerReturning(mangabindFixture);
    const adapter = new MangabindCliAdapter('C:\\tools\\mangabind.exe', runner.runner);
    const result = await adapter.run({
      inputPath: 'C:\\Manga\\São José',
      outputPath: 'C:\\Temp\\volumes',
      dryRun: true,
    });

    expect(result.report.mode).toBe('plan');
    expect(result.stderr).toBe('');
    expect(runner.run).toHaveBeenCalledWith(
      {
        executablePath: 'C:\\tools\\mangabind.exe',
        arguments: [
          '--input',
          'C:\\Manga\\São José',
          '--output',
          'C:\\Temp\\volumes',
          '--dry-run',
          '--json',
        ],
      },
      {},
    );
  });

  it('retains mangabind failure reports and diagnostics for application-level presentation', async () => {
    const failedReport = JSON.stringify({
      ...JSON.parse(mangabindFixture),
      status: 'failed',
    });
    const adapter = new MangabindCliAdapter(
      'mangabind',
      runnerReturning(failedReport, 1, 'detail').runner,
    );

    await expect(
      adapter.run({ inputPath: '/missing', outputPath: '/tmp/output', dryRun: false }),
    ).resolves.toMatchObject({ exitCode: 1, stderr: 'detail', report: { status: 'failed' } });
  });

  it('decodes mangapress progress while it runs and returns its final result', async () => {
    const onEvent = vi.fn();
    const runner = runnerReturning(mangapressFixture);
    const adapter = new MangapressCliAdapter('/tools/mangapress', runner.runner);
    const controller = new AbortController();
    const result = await adapter.run(
      {
        inputPath: '/tmp/Vol.01.cbz',
        outputPath: '/library/Vol.01.epub',
        profile: 'KV',
        format: 'epub',
        dryRun: false,
      },
      { onEvent, signal: controller.signal },
    );

    expect(onEvent).toHaveBeenCalledTimes(18);
    expect(result.result).toMatchObject({ type: 'result', written: true });
    expect(result.errors).toEqual([]);
    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: '/tools/mangapress' }),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('retains structured errors and partial progress after a nonzero exit', async () => {
    const lines = mangapressFixture.trimEnd().split('\n').slice(0, 2);
    lines.push(
      JSON.stringify({
        protocol_version: 1,
        tool: 'mangapress',
        tool_version: 'candidate',
        sequence: 3,
        type: 'error',
        severity: 'error',
        code: 'page_processing_failed',
        stage: 'process',
        manga: 'A Work',
        chapter: 'Chapter 1',
        page: 17,
        path: '/input.cbz',
        recoverable: true,
        message: "Couldn't process page 17 in chapter 'Chapter 1'.",
        diagnostic: 'decoder detail',
      }),
    );
    const adapter = new MangapressCliAdapter(
      'mangapress',
      runnerReturning(`${lines.join('\n')}\n`, 1).runner,
    );
    const result = await adapter.run({
      inputPath: '/input.cbz',
      outputPath: '/output.epub',
      profile: 'KV',
      format: 'epub',
      dryRun: false,
    });

    expect(result.result).toBeUndefined();
    expect(result.errors).toMatchObject([
      { code: 'page_processing_failed', chapter: 'Chapter 1', page: 17 },
    ]);
  });

  it('rejects empty, malformed, and successful partial streams', async () => {
    const request = {
      inputPath: '/input.cbz',
      outputPath: '/output.epub',
      profile: 'KV',
      format: 'epub' as const,
      dryRun: false,
    };

    await expect(
      new MangapressCliAdapter('tool', runnerReturning('').runner).run(request),
    ).rejects.toMatchObject({
      code: 'empty_stream',
    });
    await expect(
      new MangapressCliAdapter('tool', runnerReturning('{').runner).run(request),
    ).rejects.toMatchObject({
      code: 'incomplete_line',
    });
    await expect(
      new MangapressCliAdapter(
        'tool',
        runnerReturning(mangapressFixture.split('\n')[0] + '\n').runner,
      ).run(request),
    ).rejects.toMatchObject({ code: 'invalid_payload' });
  });

  it('distinguishes error events from additive future events', () => {
    const future = parseMangapressEventLine(
      '{"protocol_version":1,"tool":"mangapress","tool_version":"x","sequence":1,"type":"future"}',
    );

    expect(isMangapressErrorEvent(future)).toBe(false);
  });

  it('loads device profiles from mangapress structured output', async () => {
    const stream = [
      {
        protocol_version: 1,
        tool: 'mangapress',
        tool_version: '0.5.0',
        sequence: 1,
        type: 'profile',
        code: 'KV',
        name: 'Kindle Voyage',
        width: 1072,
        height: 1448,
        gray_levels: 16,
        family: 'kindle',
      },
      {
        protocol_version: 1,
        tool: 'mangapress',
        tool_version: '0.5.0',
        sequence: 2,
        type: 'result',
        status: 'completed',
        operation: 'list_profiles',
      },
    ]
      .map((event) => JSON.stringify(event))
      .join('\n');
    const returning = runnerReturning(`${stream}\n`);
    const profiles = await new MangapressCliAdapter('mangapress', returning.runner).listProfiles();

    expect(profiles.profiles).toMatchObject([{ code: 'KV', name: 'Kindle Voyage' }]);
    expect(returning.run.mock.calls[0]?.[0].arguments).toEqual([
      '--list-profiles',
      '--json-events',
    ]);
  });

  it.each([
    { exitCode: 1, operation: 'list_profiles' },
    { exitCode: 0, operation: 'convert' },
  ])('rejects an invalid profile listing: %j', async ({ exitCode, operation }) => {
    const stream = `${JSON.stringify({
      protocol_version: 1,
      tool: 'mangapress',
      tool_version: '0.5.0',
      sequence: 1,
      type: 'result',
      status: 'completed',
      operation,
    })}\n`;

    await expect(
      new MangapressCliAdapter(
        'mangapress',
        runnerReturning(stream, exitCode).runner,
      ).listProfiles(),
    ).rejects.toMatchObject({ code: 'invalid_payload' });
  });
});
