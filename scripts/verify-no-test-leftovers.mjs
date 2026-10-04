// Fails when a run of the end-to-end suite left anything of the app's or the suite's own in the
// temporary folder. The suite moves the temporary folder of its whole run into one folder it
// removes at the end (see wdio.conf.ts), so a name that starts with `mangabound` here, once the
// suite is over, is something that escaped it: before that was fixed a run left a folder for each
// spec file, with the converted books in it, and nothing removed them.
//
//   node scripts/verify-no-test-leftovers.mjs
import { readdirSync } from 'node:fs';
import os from 'node:os';

const left = readdirSync(os.tmpdir()).filter((name) => name.startsWith('mangabound'));

if (left.length > 0) {
  console.error(
    `${String(left.length)} left in ${os.tmpdir()} by the end-to-end run: ${left.join(', ')}`,
  );
  process.exit(1);
}
console.log(`Nothing of the end-to-end run is left in ${os.tmpdir()}.`);
