# ADR 0004: Four testing layers and cross-platform CI gates

- Status: Accepted
- Date: 2026-09-14

## Context

A GUI does not reduce the need for the fixture-based discipline already present in mangabind and mangapress. Process orchestration, mapping, output ordering, and user-facing failures are program behavior even when initiated by a button.

## Decision

Testing is a design constraint and part of the definition of done:

1. **CLI contract tests in the owning repositories.** Structured JSON success, warning, progress, and error output is unit/integration-tested against real repository fixtures and follows each project's conventions. Mangabind gains a new ADR that supersedes ADR 0009 before its structured output is implemented. Mangapress records any equivalent contract decision required by its conventions.
2. **Mangabound unit tests with Vitest.** Domain rules, mapping assignments, subprocess orchestration, cancellation, error normalization, library indexing, OPDS ordering, and adapter contract parsing run without rendering the application.
3. **React component tests and stories.** React Testing Library tests accessible behavior. Storybook records normal, loading, empty, disabled, warning, and error states. Accessibility checks and screenshot regression detect semantic and visual drift.
4. **Packaged application E2E with WebdriverIO.** Tests launch the packaged Electron application and exercise at least one real fixture from CBZ or chapter folder through pinned mangabind and mangapress binaries to a saved book and newest-first OPDS entry. Stubs may cover rare failures, but never replace the real happy-path pipeline.

Every pull request runs formatting, linting, strict type checking, unit tests, component tests, Storybook build/behavior checks, packaging, and packaged-shell E2E on Windows, macOS, and Linux. Full pipeline E2E activates as a required gate as soon as the structured-protocol releases can be pinned. Linux release coverage includes X11 and Wayland sessions; representative tiling-window-manager behavior is additionally checked before release.

Tests must tie failures to durable fixture names and stages. CI uploads useful failure artifacts such as screenshots, structured logs, and produced files without exposing user data.

## Consequences

Critical behavior must be separable from React and Electron APIs. Process launch and IPC require injectable boundaries. Stories and fixtures are production assets, not after-the-fact documentation.

Playwright remains appropriate for browser-based Storybook visual checks, but its Electron automation API is still experimental. WebdriverIO's Electron service is therefore the packaged-app E2E driver.

Storybook uses its supported Vite renderer and Vitest browser addon for isolated component work. That testing-only choice is independent of Electron Forge's still-experimental Vite plugin; the application build remains on Forge Webpack.
