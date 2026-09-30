import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');

function getAllHtmlFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllHtmlFiles(filePath));
    } else if (file.endsWith('.html')) {
      results.push(filePath);
    }
  }
  return results;
}

const htmlFiles = getAllHtmlFiles(distDir);
console.log(`Auditing ${htmlFiles.length} HTML files in ${distDir}...`);

let totalLinks = 0;
let internalLinksCount = 0;
let externalLinksCount = 0;
let brokenLinks = [];

// Regular expression to extract <a ... href="..." ...>
const aTagRegex = /<a\s+[^>]*href=["']([^"']*)["'][^>]*>/gi;
const idRegex = /id=["']([^"']+)["']/gi;
const nameRegex = /name=["']([^"']+)["']/gi;

// Cache page IDs
const pageIdsCache = new Map();

function getPageIds(filePath) {
  if (pageIdsCache.has(filePath)) {
    return pageIdsCache.get(filePath);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const ids = new Set();
  let m;
  while ((m = idRegex.exec(content)) !== null) {
    ids.add(m[1]);
  }
  while ((m = nameRegex.exec(content)) !== null) {
    ids.add(m[1]);
  }
  pageIdsCache.set(filePath, ids);
  return ids;
}

for (const filePath of htmlFiles) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relSource = path.relative(distDir, filePath);
  let match;

  while ((match = aTagRegex.exec(content)) !== null) {
    const rawHref = match[1].trim();
    totalLinks++;

    // Ignore mailto, tel, javascript
    if (
      rawHref.startsWith('mailto:') ||
      rawHref.startsWith('tel:') ||
      rawHref.startsWith('javascript:')
    ) {
      continue;
    }

    // External link
    if (rawHref.startsWith('http://') || rawHref.startsWith('https://')) {
      externalLinksCount++;
      continue;
    }

    internalLinksCount++;

    // Internal link: separate path and hash
    let [urlPath, hash] = rawHref.split('#');

    // If it's just an anchor on the same page
    if (!urlPath && hash) {
      const pageIds = getPageIds(filePath);
      const decodedHash = decodeURIComponent(hash);
      if (!pageIds.has(hash) && !pageIds.has(decodedHash)) {
        brokenLinks.push({
          source: relSource,
          href: rawHref,
          reason: `Anchor #${hash} not found in current page`,
        });
      }
      continue;
    }

    // Resolve target path
    let targetFilePath = null;

    if (urlPath.startsWith('/mangabound/')) {
      // Base path relative
      const cleanPath = urlPath.replace(/^\/mangabound\//, '');
      const candidate1 = path.join(distDir, cleanPath, 'index.html');
      const candidate2 = path.join(distDir, cleanPath);
      const candidate3 = path.join(distDir, cleanPath + '.html');

      if (fs.existsSync(candidate1)) targetFilePath = candidate1;
      else if (fs.existsSync(candidate2) && !fs.statSync(candidate2).isDirectory())
        targetFilePath = candidate2;
      else if (fs.existsSync(candidate3)) targetFilePath = candidate3;
    } else if (urlPath.startsWith('/')) {
      // Root relative (without base prefix or with)
      const cleanPath = urlPath.replace(/^\//, '');
      const candidate1 = path.join(distDir, cleanPath, 'index.html');
      const candidate2 = path.join(distDir, cleanPath);
      const candidate3 = path.join(distDir, cleanPath + '.html');

      if (fs.existsSync(candidate1)) targetFilePath = candidate1;
      else if (fs.existsSync(candidate2) && !fs.statSync(candidate2).isDirectory())
        targetFilePath = candidate2;
      else if (fs.existsSync(candidate3)) targetFilePath = candidate3;
    } else {
      // Relative path from current file directory
      const currentDir = path.dirname(filePath);
      const candidate1 = path.resolve(currentDir, urlPath, 'index.html');
      const candidate2 = path.resolve(currentDir, urlPath);
      const candidate3 = path.resolve(currentDir, urlPath + '.html');

      if (fs.existsSync(candidate1)) targetFilePath = candidate1;
      else if (fs.existsSync(candidate2) && !fs.statSync(candidate2).isDirectory())
        targetFilePath = candidate2;
      else if (fs.existsSync(candidate3)) targetFilePath = candidate3;
    }

    if (!targetFilePath || !fs.existsSync(targetFilePath)) {
      brokenLinks.push({
        source: relSource,
        href: rawHref,
        reason: `Target file not found: ${urlPath}`,
      });
      continue;
    }

    // Check hash if present
    if (hash) {
      const pageIds = getPageIds(targetFilePath);
      const decodedHash = decodeURIComponent(hash);
      if (!pageIds.has(hash) && !pageIds.has(decodedHash)) {
        brokenLinks.push({
          source: relSource,
          href: rawHref,
          reason: `Target anchor #${hash} not found in ${path.relative(distDir, targetFilePath)}`,
        });
      }
    }
  }
}

console.log(`\nAudit Results:`);
console.log(`Total links analyzed: ${totalLinks}`);
console.log(`Internal links: ${internalLinksCount}`);
console.log(`External links: ${externalLinksCount}`);
console.log(`Broken links: ${brokenLinks.length}`);

if (brokenLinks.length > 0) {
  console.error('\nBroken links detected:');
  for (const b of brokenLinks) {
    console.error(`- In ${b.source} -> href="${b.href}" (${b.reason})`);
  }
  process.exit(1);
} else {
  console.log('\n[PASS] All internal links and anchor IDs resolved successfully!');
}
