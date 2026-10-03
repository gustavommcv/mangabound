# ADR 0034: Tutorial images come from the site's source commit

- Status: Accepted
- Date: 2026-10-02
- Amends: ADR 0033 (released-behavior policy and screenshot build inputs)

## Context

Manually maintained app screenshots drift as the interface changes. The guide is published on a merge to `main`, not on a version tag. Updating its images only on release would leave the published text and interface illustrations describing different commits. Existing Storybook stories already render realistic interface states without Electron or conversion tools. KOReader is a separate application whose menus cannot be captured by those stories.

## Decision

- Generate Mangabound tutorial PNGs with Playwright against the static Storybook build of the same checkout. Reuse existing stories and controlled interactions; add a story variant only when the tutorial needs a distinct existing application state. Do not build a second interface for illustrations or edit text into screenshots.
- Keep generation separate from visual regression. Assert the expected controls and resulting states before capture, wait for fonts, disable animation, hide the caret, and remove incidental keyboard focus. This does not update or approve screenshot baselines, nor replace behavior, accessibility, visual, or packaged-app tests.
- Generate one artifact in documentation CI on every PR and `main` update. Windows and Linux site checks and the production build consume that run's artifact, never a previous run's images. Record the source commit and story IDs in the artifact. Publish only from `main` after documentation verification succeeds.
- Keep generated PNGs out of Git and the application installer. The independent Astro package consumes image files, not React/Electron modules. Astro provides image optimization and dimensions. Local root `site:dev`, `site:build`, and `site:check` commands prepare the screenshots before invoking the website package.
- The published guide and automatic app captures track `main`. They may therefore show changes not yet present in the latest downloadable release; user-facing guidance must say so. This deliberately amends ADR 0033's released-behavior restriction without making the site a canary deployment or changing the application release workflow.
- Commit manually supplied KOReader stills with device/version provenance, permission, and crop records. Preserve original pixels and remove personal paths and manga artwork. Show a useful final state followed by native, keyboard-operable collapsible steps. Keep the written instructions complete; do not automate a physical reader or introduce a gallery/animation framework.

## Consequences

The guide's app images stay aligned with its source without screenshot-only commits or a regeneration bot. A failed capture or broken image prevents publication. Contributors preparing images need the root Storybook dependencies and a Chromium browser; the website runtime and build remain independent once the image inputs are supplied. Documentation CI gains a capture job, but no conversion-tool acquisition, Electron packaging, or release job.

Storybook uses deterministic sample data: it illustrates the UI, not real filesystem or e-reader behavior. Visual review remains necessary for legibility and correct framing. KOReader captures stay manual and need review when its menus change. Generated tutorial images are not a substitute for approved visual regression baselines.

## References

- [Storybook static publishing](https://storybook.js.org/docs/sharing/publish-storybook)
- [Playwright element screenshots](https://playwright.dev/docs/screenshots)
- [Astro image support](https://docs.astro.build/en/guides/images/)
