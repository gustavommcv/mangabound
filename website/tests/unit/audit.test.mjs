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

/** Exercise the real audit-ci CLI and npm, without depending on the public registry's uptime. */
async function audit(
  t,
  { config = policy, advisories = fixture, packages = lock, status = 200 } = {},
) {
  const directory = await mkdtemp(path.join(tmpdir(), 'mangabound-audit-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'package.json'), JSON.stringify(packages.packages['']));
  await writeFile(path.join(directory, 'package-lock.json'), JSON.stringify(packages));
  const configPath = path.join(directory, 'audit-ci.json');
  await writeFile(configPath, JSON.stringify(config));
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
      env: {
        ...process.env,
        npm_config_cache: path.join(directory, 'cache'),
        npm_config_fetch_retries: '0',
        npm_config_update_notifier: 'false',
      },
      maxBuffer: 1024 * 1024,
    },
  ).then(
    ({ stdout, stderr }) => ({ code: 0, output: stdout + stderr }),
    ({ code, stdout, stderr }) => ({ code, output: stdout + stderr }),
  );
  return { ...result, bulkRequests, requests };
}

test('the recorded advisory is accepted only on its reviewed paths and remains visible', async (t) => {
  const result = await audit(t);
  assert.equal(result.code, 0, result.output);
  assert.equal(result.bulkRequests, 1);
  assert.match(result.output, /http-cache-semantics max-stale handling/);
  assert.match(result.output, /GHSA-ch52-4w7c-c8xp/);
  assert.match(result.output, /"high": 5/);
});

test('the same recorded advisory fails without the exception', async (t) => {
  const result = await audit(t, { config: { ...policy, allowlist: [] } });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Failed security audit due to high/);
});

test('a clean registry report passes without suppressing audit failures', async (t) => {
  const result = await audit(t, { advisories: {} });
  assert.equal(result.code, 0, result.output);
  assert.equal(result.bulkRequests, 1);
  assert.match(result.output, /"total": 0/);
});

test('expiry and invalid expiry disable the exception', async (t) => {
  for (const expiry of ['2000-01-01T00:00:00.000Z', 'invalid']) {
    const config = structuredClone(policy);
    for (const record of config.allowlist) Object.values(record)[0].expiry = expiry;
    const result = await audit(t, { config });
    assert.notEqual(result.code, 0);
    assert.match(result.output, /Failed security audit due to high/);
  }
});

test('a different advisory in the same package is still blocked at every severity', async (t) => {
  for (const severity of ['low', 'moderate', 'high', 'critical']) {
    const advisories = structuredClone(fixture);
    advisories['http-cache-semantics'].push({
      ...advisories['http-cache-semantics'][0],
      id: 9999999,
      url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
      title: 'Deliberately injected unaccepted advisory',
      severity,
    });
    const result = await audit(t, { advisories });
    assert.notEqual(result.code, 0);
    assert.match(result.output, new RegExp(`Failed security audit due to .*${severity}`));
    assert.match(result.output, /GHSA-aaaa-bbbb-cccc/);
  }
});

test('the recorded advisory through another consumer is not accepted', async (t) => {
  const packages = structuredClone(lock);
  packages.packages[''].dependencies['http-cache-semantics'] = '4.2.0';
  const result = await audit(t, { packages });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /GHSA-ch52-4w7c-c8xp\|http-cache-semantics/);
});

test('an advisory in a development dependency is not omitted', async (t) => {
  const advisories = structuredClone(fixture);
  advisories['audit-ci'] = [
    {
      ...advisories['http-cache-semantics'][0],
      id: 9999999,
      url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
      title: 'Deliberately injected development dependency advisory',
      severity: 'low',
      vulnerable_versions: '<=7.1.0',
    },
  ];
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
