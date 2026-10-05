import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const script = path.resolve('scripts/verify-release-commit.mjs');

function decide(facts: unknown): { readonly status: number | null; readonly output: string } {
  const run = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    input: typeof facts === 'string' ? facts : JSON.stringify(facts),
  });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

const passed = { databaseId: 20, status: 'completed', conclusion: 'success' };

describe('whether the commit of a release tag may be released', () => {
  it('may, when it is on main and its CI run passed', () => {
    const run = decide({ onMain: true, runs: [passed] });

    expect(run.status).toBe(0);
    expect(run.output).toContain('on main and its CI run passed');
  });

  it('may not when it is not on main, whatever CI said of it', () => {
    for (const onMain of [false, undefined, 'true', 1, null]) {
      const run = decide({ onMain, runs: [passed] });

      expect(run.status, String(onMain)).toBe(1);
      expect(run.output).toContain('not on main');
    }
  });

  it('is not decided while CI has not started, or has not finished', () => {
    for (const facts of [
      { onMain: true, runs: [] },
      { onMain: true },
      { onMain: true, runs: 'none' },
    ]) {
      const run = decide(facts);

      expect(run.status).toBe(2);
      expect(run.output).toContain('no run for this commit yet');
    }
    for (const status of ['queued', 'in_progress', 'waiting', 'pending']) {
      const run = decide({ onMain: true, runs: [{ databaseId: 1, status, conclusion: null }] });

      expect(run.status, status).toBe(2);
      expect(run.output).toContain(`still ${status}`);
    }
  });

  it('may not when CI did not pass', () => {
    for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out', null]) {
      const run = decide({
        onMain: true,
        runs: [{ databaseId: 1, status: 'completed', conclusion }],
      });

      expect(run.status, String(conclusion)).toBe(1);
      expect(run.output).toContain(`did not pass for this commit (${String(conclusion)})`);
    }
  });

  it('goes by the newest run, wherever it is in the list', () => {
    const failed = { databaseId: 10, status: 'completed', conclusion: 'failure' };
    const running = { databaseId: 30, status: 'in_progress', conclusion: null };
    const failedLater = { databaseId: 40, status: 'completed', conclusion: 'failure' };

    expect(decide({ onMain: true, runs: [failed, passed] }).status).toBe(0);
    expect(decide({ onMain: true, runs: [passed, failed] }).status).toBe(0);
    expect(decide({ onMain: true, runs: [passed, failedLater] }).status).toBe(1);
    expect(decide({ onMain: true, runs: [failedLater, passed] }).status).toBe(1);
    expect(decide({ onMain: true, runs: [passed, running, failed] }).status).toBe(2);
  });

  it('may not when what it was told is JSON but not facts about a commit', () => {
    for (const input of ['null', '42', '"main"', '[]']) {
      expect(decide(input).status, input).toBe(1);
    }
  });

  it('may not when what it was told is not JSON', () => {
    for (const input of ['', 'not json', '{']) {
      const run = decide(input);

      expect(run.status, input).toBe(1);
      expect(run.output).toContain('not JSON');
    }
  });
});
