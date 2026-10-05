// Decides whether the commit a release tag names may be released, from what the release workflow
// found out about it, read as JSON on standard input:
//
//   { "onMain": true, "runs": [{ "databaseId": 1, "status": "completed", "conclusion": "success" }] }
//
// `onMain` is whether the commit is reachable from `main`; `runs` are the runs of the CI workflow
// for that exact commit on a push (what `gh run list --workflow ci.yml --commit <sha> --event push
// --json databaseId,status,conclusion` prints). A tag builds and publishes whatever it names, and
// nothing else checked that the commit had passed anything: only that the tag matched package.json.
//
// Exit status: 0 the commit may be released, 1 it may not, 2 not yet (CI has not finished, or has
// not started), which the workflow answers by asking again a little later.
//
//   node scripts/verify-release-commit.mjs < facts.json

let input = '';
for await (const chunk of process.stdin) input += String(chunk);

let facts;
try {
  facts = JSON.parse(input);
} catch {
  console.error('The facts about the commit are not JSON.');
  process.exit(1);
}

if (facts?.onMain !== true) {
  console.error(
    'The tagged commit is not on main. A release is made from a commit of main (RELEASING.md).',
  );
  process.exit(1);
}

const runs = Array.isArray(facts.runs) ? facts.runs : [];
if (runs.length === 0) {
  console.error('CI has no run for this commit yet. Waiting for it to start.');
  process.exit(2);
}

// The newest run answers for the commit: an older one that failed does not outweigh a newer one
// that passed, and a newer one that is still going has not passed yet.
const newest = runs.reduce((latest, run) => (run.databaseId > latest.databaseId ? run : latest));
if (newest.status !== 'completed') {
  console.error(`CI is still ${String(newest.status)} for this commit. Waiting for it to finish.`);
  process.exit(2);
}
if (newest.conclusion !== 'success') {
  console.error(
    `CI did not pass for this commit (${String(newest.conclusion)}). Tag a commit whose checks are green.`,
  );
  process.exit(1);
}
console.log('The tagged commit is on main and its CI run passed.');
