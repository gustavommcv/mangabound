import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      results.push(...walk(p));
    } else if (p.endsWith('.mdx') || p.endsWith('.md')) {
      results.push(p);
    }
  }
  return results;
}

const docsDir = path.resolve('src/content/docs');
const allDocs = walk(docsDir).map((p) => path.relative(docsDir, p));

const enDocs = allDocs.filter((p) => !p.startsWith('pt-br/'));
const ptDocs = allDocs.filter((p) => p.startsWith('pt-br/')).map((p) => p.replace(/^pt-br\//, ''));

console.log(`Checking i18n parity between EN and PT-BR...`);
console.log(`EN pages: ${enDocs.length}`);
console.log(`PT-BR pages: ${ptDocs.length}`);

const missingInPt = enDocs.filter((p) => !ptDocs.includes(p));
const missingInEn = ptDocs.filter((p) => !enDocs.includes(p));

let failed = false;

if (missingInPt.length > 0) {
  console.error('\n[FAIL] Pages present in English but missing in Brazilian Portuguese:');
  for (const p of missingInPt) console.error(`  - ${p}`);
  failed = true;
}

if (missingInEn.length > 0) {
  console.error('\n[FAIL] Pages present in Brazilian Portuguese but missing in English:');
  for (const p of missingInEn) console.error(`  - ${p}`);
  failed = true;
}

if (failed) {
  process.exit(1);
} else {
  console.log('\n[PASS] 100% i18n parity: Every document has an exact bilingual counterpart!');
}
