# Contributing

Mangabound uses an npm lockfile and treats formatting, linting, type checking, tests, packaging, and packaged-app smoke tests as build gates.

## Before opening a pull request

Run:

```text
npm ci
npm run check
npm run package
npm run test:e2e
```

Use Conventional Commit-style subjects where practical. Architecture changes require a new ADR; accepted ADRs are never rewritten to conceal a reversed decision.

## Remote CI is the completion gate

After pushing any commit that is intended to complete a milestone or serve as a checkpoint, verify the GitHub Actions run for that exact commit SHA. Every required job must finish successfully; a queued or in-progress run, a green run for an earlier commit, and a complete set of passing local checks do not satisfy this gate.

Do not call the checkpoint complete or begin the next milestone until that exact remote run is green. If a job fails, inspect its remote log, fix the failure, push the correction, and repeat the check for the new commit. If access or tooling makes the remote result impossible to verify, stop and report the exact commit SHA, what could not be observed, and why. Resume only after the remote result is available and confirmed.

## Testing expectations

- Pure domain and application behavior belongs in Vitest unit tests.
- React behavior belongs in React Testing Library component tests.
- Reusable component states belong in Storybook and visual regression coverage.
- User-critical workflows belong in WebdriverIO tests against a packaged Electron application.
- Changes to mangabind or mangapress follow those repositories' existing fixture and test conventions.

Tests must assert behavior and actionable outcomes, not implementation details. A manual run is useful evidence, but it never replaces an automated regression test for a critical path.
