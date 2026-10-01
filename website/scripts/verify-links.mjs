import { readFileSync } from 'node:fs';
import path from 'node:path';

import { base, site } from '../site.config.mjs';
import { filesUnder } from './files.mjs';
import { auditLinks } from './verification.mjs';

const directory = path.resolve('dist');
const files = filesUnder(directory);
const pages = files
  .filter((file) => file.endsWith('.html'))
  .map((file) => ({ path: file, html: readFileSync(path.join(directory, file), 'utf8') }));
const result = auditLinks(pages, { base, site, assets: files });
console.log(
  `Pages: ${pages.length}; internal URLs: ${result.internal}; external URLs: ${result.external}; errors: ${result.errors.length}`,
);
for (const error of result.errors)
  console.error(`${error.source}: ${error.link} — ${error.reason}`);
if (result.errors.length) process.exitCode = 1;
