# Contributing

Start with the [architecture overview](docs/architecture.md) for module boundaries and [current priorities](docs/milestones.md#current-priorities) for pending work. The [documentation index](docs/README.md) links to the detailed guides.

## Community and reports

Follow the [Code of Conduct](CODE_OF_CONDUCT.md). Use the [issue templates](https://github.com/gustavommcv/mangabound/issues/new/choose) for bugs and suggestions; check existing issues and remove private information from attachments. Include the app version, system, reproduction steps, expected result, and actual result.

Report suspected vulnerabilities privately through [SECURITY.md](SECURITY.md), not a public issue or pull request.

## Before opening a pull request

Use Node.js 24 and npm 11+, then run:

```text
npm ci
npx playwright install chromium
npm run check
npm run package:e2e
npm run test:e2e
```

On Linux, browser setup may require `npx playwright install --with-deps chromium`. On Windows, use PowerShell: Git Bash's `tar` breaks toolchain extraction. Stop `npm start` and Storybook before packaging; their watchers can lock the build folder.

Run individual checks while working. The full local checks prepare the change for review; they do not replace the [remote-CI completion gate](#remote-ci-is-the-completion-gate).

### Language and documentation

Write application text, comments, contributor documents, commit subjects, and PR descriptions in English. The public guide has English and Portuguese versions; write each naturally and retain the application's actual English control labels in both.

Check changed documentation against current behavior and scripts. Keep pending work in [current priorities](docs/milestones.md#current-priorities). Preserve audit findings and accepted ADRs as historical records; append dated outcomes to audits rather than rewriting their original evidence.

### Documentation website

The user guide is the independent Astro/Starlight package under `website/`; `docs/` holds contributor documents. For website changes, also run `npm --prefix website ci` and `npm run site:check`. Application and website checks remain separate requirements.

`npm run site:dev` generates the tutorial images and starts the guide. The guide and automatic app captures follow `main`, which may be ahead of the latest release; KOReader captures are supplied manually. Update both languages together, and never use images as the only instructions. See [website/README.md](website/README.md) for development and checks, and [MEDIA.md](website/MEDIA.md) for illustrations.

## The gates, and what each is for

`npm run check` runs formatting, linting, module-boundary tests, type checking, the production dependency audit, tool-pin verification, unit and component tests, story tests, and the Storybook build. Visual and packaged-app tests are separate commands.

| Command                                   | Purpose                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `npm run format:check`                    | Prettier; `npm run format` applies formatting.                                   |
| `npm run lint`                            | ESLint, with no warnings allowed.                                                |
| `npm run lint:boundaries`                 | Regression tests for the module-boundary rule.                                   |
| `npm run typecheck`                       | Strict TypeScript over source and tests.                                         |
| `npm run audit:production`                | Audit the app's production dependencies.                                         |
| `npm run toolchain:check`                 | Validate the pinned converter manifest.                                          |
| `npm run test:unit`                       | Logic, adapters, and selected main/preload helpers; acquires the verified tools. |
| `npm run capabilities:check`              | Detect CLI flags the app does not represent.                                     |
| `npm run test:component`                  | Accessible React behavior against a fake desktop bridge.                         |
| `npm run test:stories`                    | Storybook interactions and axe accessibility checks.                             |
| `npm run build-storybook`                 | Build the isolated UI reference.                                                 |
| `npm run test:visual`                     | Compare selected UI states with Windows CI baselines.                            |
| `npm run package:e2e`, `npm run test:e2e` | Exercise the packaged Electron app with real converters.                         |

## Module boundaries

Follow the [layer table](docs/architecture.md#layers). `npm run lint` enforces it by resolving imports to their target files, including aliases and relative paths. `npm run lint:boundaries` tests the rule itself. Keep domain rules independent of React, Electron, Node, and adapters.

## Testing expectations

- Use Vitest for pure rules, workflows, adapters, and framework-independent main/preload decisions. The files listed in `vitest.config.ts` require **100% statements, branches, functions, and lines**; this is not a whole-app coverage claim.
- Use React Testing Library for what users see and do, not component internals.
- Cover relevant normal, loading, empty, disabled, warning, and error states in Storybook, with interaction, accessibility, and visual checks where applicable.
- Cover critical workflows with WebdriverIO against the packaged app and real tools. A manual check does not replace an automated regression test.
- Use recorded real responses for online providers. Changes to mangabind or mangapress follow those repositories' fixture and test conventions.

Tests should detect a broken behavior, not merely confirm the current implementation or increase a coverage number. See [the provider guide](docs/adding-a-metadata-provider.md) for adding and testing another online source.

## Storybook: what it is and how it is used here

`npm run storybook` opens an isolated UI workshop at <http://localhost:6006>, without Electron or conversion tools. Put `<component>.stories.tsx` beside the component, reuse existing story patterns, and use `play` interactions where behavior matters. Every story runs an axe WCAG A/AA check.

`npm run test:stories` needs Playwright's Chromium. If downloading it is unavailable, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an existing Chromium executable; CI uses Playwright's matching browser.

Visual baselines live in `tests/visual/__screenshots__` and come from Windows CI, not local rendering:

1. Push the UI change. A missing or changed baseline makes the visual job upload `storybook-visual-diff`.
2. Inspect each relevant `*-actual.png` and copy approved images over their baselines.
3. Commit, push, and verify the new remote run. Delete a known-stale baseline first if a small change falls below the comparison threshold.

The README reuses the queue's committed baseline. Tutorial captures are separate: `npm run site:media` generates ignored images for the website from the same source commit. They never approve or replace visual baselines.

## Updating the bundled tools

mangabind and mangapress are updated deliberately through `toolchain.lock.json` ([ADR 0017](docs/adr/0017-bundled-tools-are-updated-by-hand.md)):

1. Run `npm run toolchain:update -- --tool mangabind` or `--tool mangapress`. With no tool argument it updates both. To choose a specific release, add `--mangabind v<version>` or `--mangapress v<version>`. The script verifies upstream checksums and GitHub digests, then pins each platform's archive and executable hashes.
2. Optionally add `--pr-body pr.md` for a one-tool update to generate a PR description. The update script does not run a protocol handshake; it retains protocol version `1`. Acquisition and tests check the actual binaries and protocol, including their real JSON output.
3. Run the full checks above. Review `capabilities:check`; explicitly deferred flags belong in `schemas/cli-capabilities.json`, with the reason recorded as in [ADR 0035](docs/adr/0035-mangapress-0-7-first-its-options-in-steps.md).
4. Open a focused PR. A protocol change needs adapter changes, not just a new pin.

Acquisition also preserves each tool's upstream licenses and notices under `vendor/toolchain/<target>/licenses/<tool>/`. Cached copies are rechecked; incomplete caches are downloaded again. The packaged-shell tests verify these documents reach the app's resources unchanged.

## Writing an ADR

Write an ADR for a lasting architecture or product-boundary decision with meaningful trade-offs: for example, changing the CLI protocol, persistence model, security boundary, or supported output behavior. Routine bug fixes, wording, layout adjustments, and defaults normally need only the PR explanation, unless they change an accepted decision.

Keep it short: status and date, context, decision, consequences, and any ADR it amends. Add it to [the index](docs/adr/README.md). Accepted records remain immutable; supersede or amend them in a new record rather than rewriting or deleting the history.

## Pull requests

- Branch from up-to-date `main` and target `main`, the only long-lived branch.
- Keep one reviewable topic per PR; separate a refactor from a feature. Explain what changed, why, what users will notice, and how it was checked. Use Conventional Commit-style subjects where practical.
- Wait for every check on the exact PR head and the repository owner's explicit approval before a squash merge. Verify the resulting `main` commit too. A merge does not authorize a release tag.
- Delete merged branches after the resulting commit's CI succeeds. The website publishes from `main`.

## Documentation dependency audit exceptions

The documentation package audits all of its dependencies at every severity through lockfile-pinned `audit-ci`. A temporary exception requires the owner's explicit approval, an exposure assessment in [website/SECURITY.md](website/SECURITY.md), exact advisory/path records, an enforced UTC expiry, and regression tests. Do not use package-wide or wildcard exclusions, raise the threshold, omit development dependencies, or automatically renew an exception. The app's production audit is unchanged.

## Remote CI is the completion gate

After pushing any commit that is intended to complete a milestone or serve as a checkpoint, verify the GitHub Actions run for that exact commit SHA. Every required job must finish successfully; a queued or in-progress run, a green run for an earlier commit, and a complete set of passing local checks do not satisfy this gate.

Do not call the checkpoint complete or begin the next milestone until that exact remote run is green. If a job fails, inspect its remote log, fix the failure, push the correction, and repeat the check for the new commit. If access or tooling makes the remote result impossible to verify, stop and report the exact commit SHA, what could not be observed, and why. Resume only after the remote result is available and confirmed.

A job can also fail for a reason that is not in the commit: a download that stalls on the runner's network, or the Storybook preview that does not load once. The log shows it (a step that ends by its time limit, or an error before any test ran). Rerun only the failed jobs with `gh run rerun <run-id> --failed`, once the whole run has finished, and count the gate as passed only when that rerun is green. A failure that comes back is not a flake: treat it as one in the commit.
