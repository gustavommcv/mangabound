# Implementation milestones

The dependency order is **protocol first, with only contract-safe foundation work in parallel**. Building the real subprocess adapters against unreleased, moving JSON would create the exact version-skew risk the bundled-binary decision is meant to remove. The current repository scaffold, pure domain rules, UI system, and checked-in contract fixtures can proceed while the CLI work lands; real orchestration waits for published pins.

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
- Add verified build acquisition, executable verification, runtime version/protocol checks, and the updater pull-request workflow.
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
- Phase 3 — online sources for volume data: a fixed list with none chosen, MangaDex first and credited, and a contributor guide for adding another ([ADR 0013](adr/0013-online-sources-for-volume-data.md)). Persisted settings follow.
- Phase 4 — a KCC-style input queue for files and folders with drag-and-drop, results with "send to KOReader" through the M7 catalog ([ADR 0010](adr/0010-input-queue.md)). A library is a row in the queue too, read as one and named by session, never by path ([ADR 0012](adr/0012-libraries-in-the-queue.md)).

Exit: a folder whose names carry volumes converts without opening the mapping editor, and every supported process is reachable from the interface.

## M8 — Release hardening

- Complete custom-title-bar checks across Windows, macOS, X11, Wayland, and representative tiling window managers.
- Complete keyboard, screen-reader, reduced-motion, scaling, update, recovery, and corrupt-library scenarios.
- Sign/notarize installers and document release provenance.

Exit: release checklist, CI, and artifacts meet the accepted platform and quality constraints.
