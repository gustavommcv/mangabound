import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = new URL('../../', import.meta.url);
const auditBin = fileURLToPath(new URL('node_modules/audit-ci/dist/bin.js', root));
const policy = JSON.parse(await readFile(new URL('audit-ci.json', root), 'utf8'));
const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
const fixture = JSON.parse(
  await readFile(new URL('tests/fixtures/cache-advisory.json', root), 'utf8'),
);
const ciReport = JSON.parse(
  await readFile(new URL('tests/fixtures/cache-audit-ci-report.json', root), 'utf8'),
);

/** Exercise the real audit-ci CLI and npm, without depending on the public registry's uptime. */
async function audit(
  t,
  { config = policy, advisories = fixture, packages = lock, status = 200, report } = {},
) {
  const directory = await mkdtemp(path.join(tmpdir(), 'mangabound-audit-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'package.json'), JSON.stringify(packages.packages['']));
  await writeFile(path.join(directory, 'package-lock.json'), JSON.stringify(packages));
  const configPath = path.join(directory, 'audit-ci.json');
  await writeFile(configPath, JSON.stringify(config));
  const env = {
    ...process.env,
    npm_config_cache: path.join(directory, 'cache'),
    npm_config_fetch_retries: '0',
    npm_config_update_notifier: 'false',
  };
  if (report !== undefined) {
    // Replay the real CI report at the npm CLI boundary, not audit-ci's internals.
    const script = path.join(directory, 'npm.cjs');
    await writeFile(
      script,
      `#!/usr/bin/env node\nif (process.argv[2] !== 'audit' || !process.argv.includes('--json')) process.exit(2);\nconsole.log(${JSON.stringify(JSON.stringify(report))});\nprocess.exit(1);\n`,
    );
    if (process.platform === 'win32') {
      await writeFile(path.join(directory, 'npm.cmd'), `@"${process.execPath}" "${script}" %*\r\n`);
    } else {
      await writeFile(path.join(directory, 'npm'), await readFile(script), { mode: 0o755 });
    }
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
    env[pathKey] = `${directory}${path.delimiter}${env[pathKey] || ''}`;
  }
  let bulkRequests = 0;
  let requests = 0;
  const server = createServer((req, res) => {
    requests++;
    res.setHeader('content-type', 'application/json');
    if (status !== 200) {
      res.writeHead(status).end(
        JSON.stringify({
          error: {
            code: 'ENOAUDIT',
            summary: 'Your configured registry does not support audit requests.',
          },
        }),
      );
    } else if (req.url === '/-/npm/v1/security/advisories/bulk') {
      bulkRequests++;
      res.end(JSON.stringify(advisories));
    } else if (req.method === 'GET') {
      // npm derives transitive findings from the real locked package manifests.
      const name = decodeURIComponent(req.url.slice(1));
      const entry = packages.packages[`node_modules/${name}`];
      if (entry === undefined) {
        res.writeHead(404).end(JSON.stringify({ error: 'Package not in the fixture lockfile' }));
      } else {
        res.end(JSON.stringify({ name, versions: { [entry.version]: { name, ...entry } } }));
      }
    } else {
      res.writeHead(404).end(JSON.stringify({ error: 'Unexpected registry request' }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const registry = `http://127.0.0.1:${server.address().port}`;
  const result = await run(
    process.execPath,
    [
      auditBin,
      '--config',
      configPath,
      '--directory',
      directory,
      '--registry',
      registry,
      '--retry-count',
      '0',
    ],
    {
      env,
      maxBuffer: 1024 * 1024,
    },
  ).then(
    ({ stdout, stderr }) => ({ code: 0, output: stdout + stderr }),
    ({ code, stdout, stderr }) => ({ code, output: stdout + stderr }),
  );
  return { ...result, bulkRequests, requests };
}

/** The real lockfile with the version the recorded advisory was written about. */
function vulnerableLock() {
  const packages = structuredClone(lock);
  packages.packages['node_modules/http-cache-semantics'].version = '4.2.0';
  return packages;
}

test('no exception is in effect', () => {
  assert.deepEqual(policy.allowlist, []);
});

test('the locked version is outside the range of the recorded advisory', async (t) => {
  const result = await audit(t);
  assert.equal(result.code, 0, result.output);
  assert.equal(result.bulkRequests, 1);
  assert.match(result.output, /"total": 0/);
});

test('the recorded advisory fails for the version it was written about', async (t) => {
  const result = await audit(t, { packages: vulnerableLock() });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /http-cache-semantics max-stale handling/);
  assert.match(result.output, /Failed security audit due to high/);
  assert.match(result.output, /GHSA-ch52-4w7c-c8xp/);
});

test('the real cold-cache CI report of that advisory fails on every path it names', async (t) => {
  const result = await audit(t, { report: ciReport });
  assert.notEqual(result.code, 0, result.output);
  assert.equal(result.requests, 0);
  for (const dependencyPath of [
    'GHSA-ch52-4w7c-c8xp|@astrojs/starlight>@astrojs/mdx>astro>http-cache-semantics',
    'GHSA-ch52-4w7c-c8xp|astro>http-cache-semantics>',
  ])
    assert.ok(result.output.includes(dependencyPath), result.output);
});

test('a clean registry report passes without suppressing audit failures', async (t) => {
  const result = await audit(t, { advisories: {} });
  assert.equal(result.code, 0, result.output);
  assert.equal(result.bulkRequests, 1);
  assert.match(result.output, /"total": 0/);
});

test('an advisory for the locked version is blocked at every severity', async (t) => {
  for (const severity of ['low', 'moderate', 'high', 'critical']) {
    const advisories = {
      'http-cache-semantics': [
        {
          ...fixture['http-cache-semantics'][0],
          id: 9999999,
          url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
          title: 'Deliberately injected advisory',
          severity,
          vulnerable_versions: '<=4.3.0',
        },
      ],
    };
    const result = await audit(t, { advisories });
    assert.notEqual(result.code, 0);
    assert.match(result.output, new RegExp(`Failed security audit due to .*${severity}`));
    assert.match(result.output, /GHSA-aaaa-bbbb-cccc/);
  }
});

test('an advisory in a development dependency is not omitted', async (t) => {
  const advisories = {
    'audit-ci': [
      {
        ...fixture['http-cache-semantics'][0],
        id: 9999999,
        url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
        title: 'Deliberately injected development dependency advisory',
        severity: 'low',
        vulnerable_versions: '<=7.1.0',
      },
    ],
  };
  const result = await audit(t, { advisories });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Failed security audit due to low/);
  assert.match(result.output, /GHSA-aaaa-bbbb-cccc/);
});

test('an unavailable audit registry is a failure, not a clean audit', async (t) => {
  const result = await audit(t, { status: 503 });
  assert.notEqual(result.code, 0);
  assert.ok(result.requests > 0);
  assert.doesNotMatch(result.output, /Passed npm security audit/);
});
