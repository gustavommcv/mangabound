# ADR 0033: A static documentation site in an independent package

- Status: Accepted
- Date: 2026-09-30

## Context

Nontechnical readers need a searchable, illustrated guide to the released app and its e-reader workflow. Existing repository documents already define architecture, process gates, CLI protocols, and provider integration. Duplicating those contracts in a website would create competing sources of truth. The Electron build has its own dependencies and CSS pipeline; a documentation build must not require or inherit them.

## Decision

- Keep the Astro/Starlight site in `docs/` as an independent npm package with a lockfile. Its content lives under `src/content/docs/`; existing repository documents remain canonical and are linked from the site. The Electron app does not import or ship the website.
- Use Starlight's navigation, localized page labels, theme switcher, search, and accessible components. Limit presentation overrides to shared theme tokens. English and Brazilian Portuguese have matching routes, with actual English application control labels in both guides.
- Describe released behavior and distinguish CLI defaults from GUI settings. CLI pages offer selected examples and upstream references, not a second complete flag catalog or a fabricated protocol specification.
- Support screenshots and short recordings, shared across translations where the UI is identical. Text remains sufficient to complete the task. The internal media plan records capture, privacy, licensing, and accessibility requirements; unfinished author notes are not published.
- Verify the site independently: formatting, linting, Astro diagnostics, production build, negative-case unit tests for verification helpers, URL/anchor/media checks, translation parity, and browser behavior/accessibility tests. Run verification on Windows and Linux for every PR/main update. Keep the application's existing CI unchanged.
- Publish GitHub Pages only from `main`, after verification. PR jobs are read-only and concurrency is isolated from production deployment. GitHub Actions are SHA-pinned like the application's actions. One configuration supplies the deployment base to Astro, tests, and link verification.

## Consequences

Contributors can build the guide without Electron, Rust, Go, or bundled conversion binaries, at the cost of maintaining a second npm lockfile and a dedicated workflow. Existing framework behavior is reused rather than rebuilt, while actual navigation/search/accessibility outcomes remain tested.

Route parity does not establish translation correctness. Link checks do not fetch third-party sites or prove prose is accurate. Reviewers must check both languages, current source/UI, and primary technical references. KOReader guidance must distinguish book formats and identify device-tested evidence; browser tests cannot verify a physical reader. Adding media requires a visual and accessibility review, not just a passing file-existence check.
