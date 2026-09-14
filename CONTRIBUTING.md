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

## Testing expectations

- Pure domain and application behavior belongs in Vitest unit tests.
- React behavior belongs in React Testing Library component tests.
- Reusable component states belong in Storybook and visual regression coverage.
- User-critical workflows belong in WebdriverIO tests against a packaged Electron application.
- Changes to mangabind or mangapress follow those repositories' existing fixture and test conventions.

Tests must assert behavior and actionable outcomes, not implementation details. A manual run is useful evidence, but it never replaces an automated regression test for a critical path.
