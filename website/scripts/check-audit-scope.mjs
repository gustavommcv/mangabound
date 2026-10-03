import { readFile } from 'node:fs/promises';

import config from '../astro.config.mjs';
import { assertAuditScope } from './audit-scope.mjs';

const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
assertAuditScope(config, lock);
console.warn(
  'Auditing with the temporary documentation-only exception in audit-ci.json. This does not fix the vulnerable package; see SECURITY.md.',
);
