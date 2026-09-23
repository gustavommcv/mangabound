# Contributing

Mangabound uses an npm lockfile and treats formatting, linting, type checking, tests, packaging, and packaged-app smoke tests as build gates. This page is what to know before changing anything: how to run the gates, what each kind of test is for, what Storybook is, and how to open a pull request.

To understand the code before touching it, read [the architecture overview](docs/architecture.md) first. It is one page, and it says where each kind of change goes.

## Before opening a pull request

Run:

```text
npm ci
npm run check
npm run package
npm run test:e2e
```

To offer another online source for volume data, follow [the provider guide](docs/adding-a-metadata-provider.md): it lists what a source may and may not be, and every step.

Use Conventional Commit-style subjects where practical. Architecture changes require a new ADR; accepted ADRs are never rewritten to conceal a reversed decision.

## The gates, and what each is for

`npm run check` runs the first nine of these together, plus an audit of the production dependencies and a check of the tool pins. Run a single one while you work.

| Command                               | What it holds                                                                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                | Prettier. `npm run format` fixes it.                                                                                                                                               |
| `npm run lint`                        | ESLint with no warnings allowed.                                                                                                                                                   |
| `npm run lint:boundaries`             | ADR 0001's module boundaries, from `eslint.config.mjs`'s `no-restricted-imports` overrides (below).                                                                                |
| `npm run typecheck`                   | Strict TypeScript over the source and the tests.                                                                                                                                   |
| `npm run test:unit`                   | Domain, application, adapters, library, OPDS and `renderer/lib`. **100% statements, branches, functions and lines, or it fails.** It also acquires and verifies the bundled tools. |
| `npm run capabilities:check`          | Fails when mangabind or mangapress has a flag the app does not represent.                                                                                                          |
| `npm run test:component`              | Components and the whole app against a fake bridge (React Testing Library, jsdom).                                                                                                 |
| `npm run test:stories`                | Every Storybook story: its interactions and its accessibility check.                                                                                                               |
| `npm run build-storybook`             | That Storybook still builds.                                                                                                                                                       |
| `npm run test:visual`                 | Screenshots of the stories against the committed baselines. CI runs this on Windows (see below).                                                                                   |
| `npm run package`, `npm run test:e2e` | The packaged application, driven for real with the real tools.                                                                                                                     |

## Module boundaries

[ADR 0001](docs/adr/0001-electron-react-and-module-boundaries.md), elaborated in [the "May import" column of the architecture overview](docs/architecture.md#layers), says what each top-level folder under `src` may import. `eslint.config.mjs` has one `no-restricted-imports` override per folder that enforces it, checked by `npm run lint:boundaries` (part of `npm run check`); `scripts/verify-lint-boundaries.mjs` is that rule's own test, proving a legitimate import from each layer still passes and a representative violation of each boundary fails.

It catches every import written with the `@/*` alias, which is how the codebase writes a cross-layer import everywhere except `src/preload/index.ts` (both the alias and its relative form are covered there specifically, since that file's location is fixed and its relative depth is always known). What it cannot catch is a **new** cross-layer import written as a relative path somewhere else, at some other depth — `no-restricted-imports` matches the import specifier's text, not the module it resolves to, so it has no way to know `../../../application/foo` written from three levels into `src/adapters` means the same thing `@/application/foo` would. Keep using the alias for a cross-layer import, and review still catches the rest, same as it always has.

## Testing expectations

- Pure domain and application behavior belongs in Vitest unit tests.
- React behavior belongs in React Testing Library component tests.
- Reusable component states belong in Storybook and visual regression coverage.
- User-critical workflows belong in WebdriverIO tests against a packaged Electron application.
- Changes to mangabind or mangapress follow those repositories' existing fixture and test conventions.

Tests must assert behavior and actionable outcomes, not implementation details. A manual run is useful evidence, but it never replaces an automated regression test for a critical path.

Tests for online sources use responses recorded from the real service, never invented ones; the provider guide says how to record them.

## Storybook: what it is and how it is used here

**Storybook is a workshop for the interface.** It draws each screen and component on its own, in each state it can be in (a _story_), without running the app, Electron, or the conversion tools. To see it:

```text
npm run storybook
```

then open `http://localhost:6006`. The sidebar lists everything under `Workflows/`, `Shell/` and so on; each story is one state, such as "Queue / With items" or "Reset options / Asking to confirm".

We use it for four things:

1. **A reference for how every state looks,** including the ones that are hard to reach in the real app, such as an error, a failed step, or a library where one title needs volumes.
2. **An accessibility check on every state.** Each story is scanned with axe against WCAG A and AA, and a violation fails `npm run test:stories`.
3. **Interaction tests.** A story can have a `play` function that clicks and types as a person would, and asserts what happens (for example, opening the Share panel).
4. **Visual regression.** `npm run test:visual` takes a screenshot of each story and compares it with the baseline in `tests/visual/__screenshots__`. A change that alters how something looks fails until the baseline is deliberately updated.

**Writing a story.** Put `<component>.stories.tsx` next to the component. Give it a `title`, default `args` (the props), and one exported story per state:

```tsx
const meta = { title: 'Workflows/Reset options', component: ResetOptions, args: { … } } satisfies Meta<typeof ResetOptions>;
export default meta;

export const Available: StoryObj<typeof meta> = {};
export const AskingToConfirm: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Reset to defaults' }));
  },
};
```

Any state that a person can end up in deserves a story, and a screenshot test if how it looks matters.

**Running the story tests locally.** `npm run test:stories` needs a Chromium. Either `npx playwright install chromium`, or point it at a browser you already have:

```text
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/path/to/chrome" npm run test:stories
```

**Updating visual baselines.** The baselines are drawn by the Windows job in CI, and rendering differs slightly between machines, so do not generate them locally. When a story changes:

1. Push. The visual job fails and uploads an artifact named `storybook-visual-diff`.
2. Download it, look at each `*-actual.png` (it is the new state; check it is what you meant), and copy it over `tests/visual/__screenshots__/<name>.png`. A story that is new has no baseline yet and is added the same way.
3. Commit and push. The job should now pass.

A tiny text change can fall under the comparison threshold and pass against a stale baseline. If you know a baseline is out of date, delete it so CI regenerates it.

## Working on Windows

Run the npm scripts from PowerShell. The `tar` that ships with Git Bash breaks the step that unpacks the bundled tools.

Do not package (`npm run package`) while Storybook or `npm start` is running: their watchers hold the `.webpack` folder and packaging fails with an `EPERM` on a rename.

## Updating the bundled tools

mangabind and mangapress are pinned in `toolchain.lock.json`, and taking a newer release of either is a manual, deliberate step ([ADR 0017](docs/adr/0017-bundled-tools-are-updated-by-hand.md)). When one has published a release you want to ship:

1. Run, from PowerShell on Windows: `npm run toolchain:update -- --tool mangabind` (or `mangapress`; with no `--tool` it does both). It looks up the tool's latest release, downloads every supported platform's asset, checks each against the upstream `checksums.txt` and GitHub's digest, unpacks and hashes the executables, runs their handshakes, and writes the new pin into `toolchain.lock.json`. To take a specific release instead of the latest, add `--mangabind v0.5.0` (or `--mangapress v0.6.0`).
2. Add `--pr-body pr.md` (for one tool at a time) to also write a pull request description with the old and new release, the protocol versions and the upstream release notes.
3. Check it: `npm run toolchain:check`, `npm run capabilities:check` (it fails if the tool has a flag the app does not represent), `npm run test:unit`, then `npm run package:e2e` and `npm run test:e2e`.
4. Open a pull request with that change alone. CI packages and exercises the candidate on Windows, macOS, Linux and Wayland, and a person merges it.

If a release changes the machine-protocol version, that is a compatibility change and not just a new pin: the adapters validate the protocol they were written against, so it needs code changes and probably an ADR.

## Writing an ADR

A decision that changes how the app is built or what it does gets a short record in `docs/adr/`: a number, a title, a status and date, what it amends if anything, the context, the decision, and the consequences including known limits. Add its row to `docs/adr/README.md`. Accepted ADRs are immutable; when a premise changes, write a new one that says it amends the old one, and mark the old one "amended by" in the index.

## Pull requests

- One topic per pull request, and a description that says what changed, why, and how it was checked. Reviewers should be able to judge it without opening the diff first.
- Keep a change small enough to review. A refactor and a feature are two pull requests.
- The description of a user-visible change says what a person will notice.
- Delete the branch when the pull request is merged.

## Remote CI is the completion gate

After pushing any commit that is intended to complete a milestone or serve as a checkpoint, verify the GitHub Actions run for that exact commit SHA. Every required job must finish successfully; a queued or in-progress run, a green run for an earlier commit, and a complete set of passing local checks do not satisfy this gate.

Do not call the checkpoint complete or begin the next milestone until that exact remote run is green. If a job fails, inspect its remote log, fix the failure, push the correction, and repeat the check for the new commit. If access or tooling makes the remote result impossible to verify, stop and report the exact commit SHA, what could not be observed, and why. Resume only after the remote result is available and confirmed.
