import path from 'node:path';

import { filesUnder } from './files.mjs';
import { translationGaps } from './verification.mjs';

const paths = filesUnder(path.resolve('src/content/docs')).filter((file) => /\.mdx?$/.test(file));
const result = translationGaps(paths);
console.log(`English: ${result.englishCount}; Portuguese: ${result.portugueseCount}`);
for (const file of result.missingPortuguese) console.error(`Missing Portuguese: ${file}`);
for (const file of result.missingEnglish) console.error(`Missing English: ${file}`);
if (result.missingPortuguese.length || result.missingEnglish.length) process.exitCode = 1;
