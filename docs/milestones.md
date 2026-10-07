# Implementation milestones

## Current priorities

Status reviewed on **2026-10-07**. The initial M0–M7b implementation has been delivered; M8 remains in progress while public alpha releases continue. The converters are pinned and bundled, and application and documentation CI run on pull requests and `main`. Later CLI options can be explicitly deferred under [ADR 0035](adr/0035-mangapress-0-7-first-its-options-in-steps.md); the capability check reports that list. The milestones below retain the original implementation sequence, not a description of an unfinished scaffold.

Keep this short list current as work lands. Each item needs its own focused change and verification; a merge does not authorize a release tag. The full desktop checks remain in the [release checklist](release-checklist.md), not duplicated here.

| Priority | Pending work                                                                                                                                             | Completion criterion                                                                                                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Verify the actual published release packages, not only CI builds.                                                                                        | Download the published artifacts, verify checksums, and exercise a real conversion as a normal user. Automate repeatable checks and record the remaining hands-on results as required by [Releasing](../RELEASING.md).                          |
| 2        | Track and address remaining development-tool dependency findings after the Forge 8 upgrade ([#186](https://github.com/gustavommcv/mangabound/pull/186)). | Assess affected dependency paths and exposure, test compatible fixes through packaging, and record unresolved upstream findings. Do not suppress findings or treat a production-only audit as an audit of the build tooling.                    |
| 3        | Establish verifiable release origin and installer signing.                                                                                               | Publish build attestations with verification instructions; sign Windows packages and sign/notarize macOS packages when credentials and costs are approved. Checksums alone are not proof of origin.                                             |
| 4        | Finish the real-desktop release checks.                                                                                                                  | Record the tested version, platforms, and results for accessibility, scaling, title bars, update/recovery, removable-drive export, and corrupt-library scenarios. Headless checks do not substitute for compositor or physical-reader behavior. |
| 5        | Enforce the documented contribution and security policies in GitHub settings.                                                                            | With owner authorization, require PRs and CI on `main`, keep squash merges, protect release tags, and enable Dependabot alerts/security updates. Verify the applied rules without requiring a nonexistent second maintainer.                    |

Priority 1 has a [first published alpha.11 verification](releases/verification/v0.1.0-alpha.11-windows.md): all package checksums match, and Windows portable chapter-folder/CBZ conversion, native export, local OPDS acquisition, and unsaved-book recovery after a process restart passed. Installer and native macOS/Linux conversion checks remain pending; this does not close the priority or M8. The repeatable download/checksum procedure is in [Releasing](../RELEASING.md#repeat-the-download-check).

The last two audits retain smaller, lower-priority findings and accepted trade-offs: [1 October](audit-2026-10-01.md) and [4 October](audit-2026-10-04.md). This list is not a promise of new features, release dates, or bit-for-bit reproducible builds. AppImage, an alternative Windows installer, and Intel Mac support remain separate, deferred work.

## Implementation history

The original dependency order was **protocol first, with only contract-safe foundation work in parallel**. Building subprocess adapters against unreleased, moving JSON would create the version-skew risk the bundled-binary decision is meant to remove. Foundation work could proceed while the CLI contracts landed; real orchestration waited for published pins.

## M0 — Foundation and decisions

- Accept the ADRs and this milestone sequence.
- Establish Electron/React/TypeScript, the design layer, test harnesses, and CI.
- Keep `toolchain.lock.json` explicitly unpinned; distributable release builds remain disabled.

Exit: scaffold passes its applicable checks on Windows, macOS, and Linux and is confirmed before feature work.

## M1 — Structured CLI contracts in owning repositories

- In mangabind, add an ADR superseding ADR 0009 and define versioned structured discovery, plan, progress, warning, error, and result envelopes.
- In mangapress, define the equivalent versioned machine interface and record the decision according to that repository's discipline.
- Test both interfaces against existing real fixtures, including failures and edge cases.
- Publish releases for every supported target with checksums.

Safe Mangabound work in parallel is limited to domain types, application ports, UI stories, and contract parsers tested against frozen candidate fixtures. Do not invoke a locally built or floating CLI from product code.

Exit: both protocols are documented, tested, released, and immutable for their declared version.

## M2 — Reproducible toolchain acquisition

- Pin both releases and every target artifact in `toolchain.lock.json`.
- Add verified build acquisition, executable verification, runtime version/protocol checks, and a script that proposes a newer pin, run by hand ([ADR 0017](adr/0017-bundled-tools-are-updated-by-hand.md); a scheduled workflow was planned first and dropped).
- Turn the real-binary CI fixture into a required gate.

Exit: a clean build obtains the same verified binaries, packages them, and rejects tampering or skew.

## M3 — Manual mapping core

- Implement raw chapter discovery, create/move/split/merge volume assignments, validation, undoable editing, and deterministic plan serialization.
- Build the same editor state model for an empty manual start and an optional provider-suggested start.
- Cover the logic with unit tests and accessible component states.

Exit: fixtures can be mapped entirely offline without an external metadata API and produce a validated plan.

## M4 — Single-input vertical slice

- Implement typed IPC and the subprocess supervisor.
- Run single CBZ and single folder flows through the pinned CLIs.
- Normalize progress, cancellation, warnings, and contextual errors.
- Save one output book using a selected device profile and library location.

Exit: the packaged-app E2E covers a real input through a saved output on all three operating-system families.

## M5 — Batch and full capability exposure

- Add multi-manga batch planning, per-title review, sequential default execution, retry, dry-run, and metadata-file workflows. Batch uses mangabind's native `-batch` end to end (one discovery call, one bind call over the whole library); per-title manual chapter-to-volume correction goes through the existing single-input `mangabind.json`-per-folder convention rather than a batch-specific mechanism — see [ADR 0006](adr/0006-cli-first-tool-boundary.md).
- Complete the organized basic/advanced/diagnostic controls for every supported flag in both CLIs.
- Add generated contract coverage that fails when a CLI advertises an unrepresented option.

Exit: no supported CLI capability is available only from a hidden command line.

## M6 — Optional metadata providers

- Add external metadata API suggestions behind the metadata-provider port.
- Keep manual input and correction identical whether suggestions exist, fail, or are skipped.

A suggestion matches an external metadata provider's volume/chapter-number groupings against chapters already
discovered locally (by number, since ids differ) and applies as one more undoable command in the
mapping editor's existing history — never a special, non-reversible state. Metadata search/lookup
reuses the existing IPC job-cancellation mechanism; no chapter content is ever fetched, matching
ADR 0005's anti-goal against acquisition.

Exit: disabling the network does not reduce manual mapping capability.

## M7 — Library and OPDS delivery

- Build deterministic library indexing, configurable locations, atomic publication, and collision handling.
- Serve OPDS 1.2 navigation and acquisition feeds, including newest-first and recently converted views.
- Add KOReader-oriented E2E checks for ordering, links, MIME types, and acquisition.

Every successful conversion publishes into a per-folder catalog at `<library>/.mangabound/library.json`
(ADR 0007), written atomically and keyed by output path so a reconversion replaces its existing
entry instead of duplicating it — the collision handling the milestone asks for. A single OPDS 1.2
acquisition feed, always sorted newest-first, is the "recently converted" view; sharing itself is an
explicit per-session toggle bound to one user-chosen network interface, authenticated by a random
token or Basic credentials, and stopped whenever the app quits.

Exit: today's conversion is the first item in the dedicated feed and can be acquired without paging through the library.

## M7b — Workflow rework

Hands-on testing showed the wizard was the wrong shape: the app should feel like a converter with an input list, drag-and-drop and visible process control, and the mapping should start from what mangabind already knows. Work proceeds in phases, one pull request each, with the packaged-app E2E and the visual baselines green before the next.

- Phase 0 — a fixed, sober dark theme (no accent-green, no glow, sentence-case labels).
- Phase 1 — the mapping editor starts from mangabind's own grouping; online lookups appear only when a provider exists and search only on request ([ADR 0008](adr/0008-mapping-starts-from-mangabind-grouping.md)).
- Phase 2 — process control: join volumes only, convert only, or both ([ADR 0009](adr/0009-process-modes.md)).
- Phase 3 — online sources for volume data: a fixed list with none chosen, MangaDex first and credited, and a contributor guide for adding another ([ADR 0013](adr/0013-online-sources-for-volume-data.md)). The options are then kept between sessions and can be put back to their defaults ([ADR 0014](adr/0014-persisted-settings-and-reset.md)).
- Phase 4 — a KCC-style input queue for files and folders with drag-and-drop, results with "send to KOReader" through the M7 catalog ([ADR 0010](adr/0010-input-queue.md)). A library is a row in the queue too, read as one and named by session, never by path ([ADR 0012](adr/0012-libraries-in-the-queue.md)).

Exit: a folder whose names carry volumes converts without opening the mapping editor, and every supported process is reachable from the interface.

## M8 — Release hardening

Paused partway through to ship the first public alpha instead of finishing every item below first: `v0.1.0-alpha.1` through `v0.1.0-alpha.11` are out (see `docs/releases/`), with work on what M8 originally listed resuming in between.

**Done:**

- GitHub Actions pinned to commit SHAs, not tags (PR #35).
- A release tag must name a commit reachable from `main` whose exact push CI passed; all release builds wait for that gate. Public assets include `SHA256SUMS`, with a check that its filenames match the uploaded assets ([RELEASING.md](../RELEASING.md)). This is not a build attestation or an installer signature.
- Contributor policies, issue/PR templates, and private vulnerability reporting are documented. The independent bilingual guide has automated Storybook tutorial captures and its own browser, accessibility, link, and dependency-audit gates ([website/README.md](../website/README.md)). GitHub settings still need to enforce the repository policies.
- Focus management for screen transitions and the Share panel: the six main screens' headings, and the running screen specifically, move focus on mount; SharePanel's start/stop transitions focus sensibly even when "Start sharing" is disabled (PR #36).
- The real Windows bug the alpha surfaced - the app opening once via Squirrel's own post-install launch, then never again via the Start Menu shortcut, leaving idle background processes - root-caused (an Electron `<44.4.4` regression, `electron/electron#54025`) and fixed by the Electron bump plus dropping the app's dependence on `ready-to-show` entirely (`src/main/window.ts`).
- A portable Windows build (`.zip`, unzip and run, no installer, no admin rights) ships alongside Squirrel.
- A recurring Windows CI flake in `settings.e2e.ts` root-caused (a transient Windows file-rename failure when another process has the file open) and fixed with a bounded retry in `FsSettingsStore`, not just reruns.
- `ci.yml`'s `make-verification` job and `release.yml`'s `build` job, which had drifted into ~95% duplicate copies of each other (and once caused a real bug: a SHA-pinning pass updated one and missed the other), unified into one `workflow_call` reusable workflow (`.github/workflows/make.yml`), called from both.
- The pinned mangabind/mangapress binaries no longer download over the network on every single CI job that needs them: `scripts/acquire-toolchain.mjs` gained a fast path that trusts (and re-verifies the hash of) an already-acquired, already-matching copy, and every job that needs the toolchain now caches `vendor/toolchain/` keyed on the lock file's hash.
- Arch/pacman packaging: no Electron Forge maker exists for this, so it's a hand-rolled `PKGBUILD` (`packaging/arch/`) following the ArchWiki's Electron package guidelines, built in CI via a `workflow_call` reusable workflow (`.github/workflows/arch-package.yml`) shared between `ci.yml` and `release.yml`, the same pattern as `make.yml`. Publishes a `.pkg.tar.zst` a person installs with `pacman -U`, not an AUR submission (still out of scope).
- Product changes shipped through the alphas, each with its own record: one book for a whole series with a two-level table of contents, EPUB only for now ([ADR 0024](adr/0024-combine-into-one-volume-is-epub-only.md), [ADR 0025](adr/0025-single-book-mode-workflow-control.md)); process first, then save from durable pending books ([ADR 0026](adr/0026-process-then-save-pending-books.md)); bounded parallel conversion of separate volumes ([ADR 0027](adr/0027-bounded-volume-conversion.md)); live page-level progress while volumes are built ([ADR 0028](adr/0028-binding-progress-from-the-verified-tool.md)); books of one run that never replace each other ([ADR 0029](adr/0029-books-of-one-run-never-replace-each-other.md)); title, author and language set for each book on its own page ([ADR 0030](adr/0030-title-author-and-language-belong-to-each-book.md)), with an optional author lookup in a source the person chooses ([ADR 0031](adr/0031-look-up-the-author-in-a-source-the-person-chooses.md)); and the author and language kept with the folder ([ADR 0032](adr/0032-keep-the-author-and-language-with-the-folder.md)).

**Investigated and deferred, not abandoned - see [ADR 0021](adr/0021-windows-installer-stays-squirrel.md):**

- A wizard-based Windows installer (`@electron-forge/maker-wix`, replacing Squirrel's silent install): the wizard itself worked; its shortcut mechanism is broken by a crashing vendored binary this project doesn't control.
- AppImage as a fourth Linux artifact: a structural FUSE/`chrome-sandbox` incompatibility in the format itself (see `docs/releases/v0.1.0-alpha.1.md`'s "Known limitations").

**Still open:**

The [current priorities](#current-priorities) distinguish engineering work from owner-controlled credentials/settings and hands-on platform validation. Signing, provenance, and the remaining desktop checks are not complete merely because the automated suites pass.

Exit: release checklist, CI, and artifacts meet the accepted platform and quality constraints.
