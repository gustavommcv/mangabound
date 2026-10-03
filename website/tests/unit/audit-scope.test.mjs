import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import config from '../../astro.config.mjs';
import { assertAuditScope } from '../../scripts/audit-scope.mjs';

const lock = JSON.parse(
  await readFile(new URL('../../package-lock.json', import.meta.url), 'utf8'),
);

test('the actual site and lockfile satisfy the reviewed exception scope', () => {
  assert.doesNotThrow(() => assertAuditScope(config, lock));
  assert.doesNotThrow(() => assertAuditScope({ output: 'static' }, lock));
});

test('server output, an adapter, or an unresolved configuration requires review', () => {
  for (const changed of [{ output: 'server' }, { adapter: {} }, null, () => config]) {
    assert.throws(() => assertAuditScope(changed, lock), /requires a static site/);
  }
});

test('upgrading either reviewed package requires removing or reviewing the exception', () => {
  for (const name of ['astro', 'http-cache-semantics']) {
    const changed = structuredClone(lock);
    changed.packages[`node_modules/${name}`].version = '999.0.0';
    assert.throws(() => assertAuditScope(config, changed), new RegExp(`before changing ${name}@`));
  }
});

test('missing, duplicate, and relocated reviewed packages cannot bypass the scope check', () => {
  for (const name of ['astro', 'http-cache-semantics']) {
    for (const kind of ['missing', 'duplicate', 'relocated']) {
      const changed = structuredClone(lock);
      const path = `node_modules/${name}`;
      if (kind !== 'missing') {
        changed.packages[`node_modules/another-consumer/${path}`] = changed.packages[path];
      }
      if (kind !== 'duplicate') delete changed.packages[path];
      assert.throws(() => assertAuditScope(config, changed), /Review or remove/);
    }
  }
});
