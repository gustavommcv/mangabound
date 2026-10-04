// Reads the listing of a Linux package on standard input and fails when something in it cannot be
// used by someone who is not root. The app is installed by root and run by a person, so a folder
// only root can enter, or a program only root can run, installs without a word and then does not
// work: a bundled tool that cannot be opened keeps every conversion from starting.
//
//   dpkg-deb -c mangabound.deb | node scripts/verify-package-permissions.mjs mangabound.deb
//   rpm -qlvp mangabound.rpm   | node scripts/verify-package-permissions.mjs mangabound.rpm
//   tar --zstd -tvf mangabound.pkg.tar.zst | node scripts/verify-package-permissions.mjs mangabound.pkg.tar.zst
//
// The three listings begin every line the same way (`drwxr-xr-x`, then an owner and a size laid
// out differently in each), and only that beginning is read.

const label = process.argv[2] ?? 'the package';
const entryStart = /^([-dlbcps])([-rwxsStT]{9})(?:\s|$)/u;
const shownOffenders = 20;

/**
 * What stops someone who is not root from using an entry, or `undefined` when nothing does.
 * `type` is the listing's first character (`d` a folder, `-` a file) and `permissions` the nine
 * that follow it.
 */
function problemWith(type, permissions) {
  const [, , ownerExecute, , , , otherRead, , otherExecute] = permissions;
  const canEnter = otherExecute === 'x' || otherExecute === 't';
  if (type === 'd') {
    return otherRead === 'r' && canEnter ? undefined : 'a folder that only its owner can open';
  }
  if (type === '-') {
    if (otherRead !== 'r') return 'a file that only its owner can read';
    const ownerRuns = ownerExecute === 'x' || ownerExecute === 's';
    if (ownerRuns && !canEnter) return 'a program that only its owner can run';
  }
  return undefined;
}

let listing = '';
for await (const chunk of process.stdin) listing += String(chunk);

const offenders = [];
let checked = 0;
for (const line of listing.split(/\r?\n/u)) {
  const entry = entryStart.exec(line);
  if (entry === null) continue;
  checked += 1;
  const problem = problemWith(entry[1], entry[2]);
  if (problem !== undefined) offenders.push(`${problem}: ${line.trim()}`);
}

if (checked === 0) {
  console.error(`${label}: no entry could be read from the listing. Is it a package listing?`);
  process.exit(2);
}
if (offenders.length > 0) {
  console.error(
    `${label}: ${String(offenders.length)} of ${String(checked)} entries cannot be used by someone who is not root.`,
  );
  for (const offender of offenders.slice(0, shownOffenders)) console.error(`  ${offender}`);
  if (offenders.length > shownOffenders) {
    console.error(`  … and ${String(offenders.length - shownOffenders)} more.`);
  }
  process.exit(1);
}
console.log(`${label}: ${String(checked)} entries, every one usable by someone who is not root.`);
