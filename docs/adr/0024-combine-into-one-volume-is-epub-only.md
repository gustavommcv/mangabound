# ADR 0024: Bind the whole series as one volume, EPUB only for now

- Status: Accepted
- Date: 2026-09-27
- Amends: [ADR 0009](0009-process-modes.md) (the interface shows what will and will not run)

## Context

For a very long series (One Piece, 100+ volumes), grouping chapters into one book per volume is
still too fragmented for someone who wants the whole series as a single continuous read. The
request: bind the entire series into one output file, while keeping two levels of navigation
inside it — a volume entry, its chapters nested underneath, the way a normal volume already gets
one table-of-contents entry per chapter.

This is a cross-repo feature. Checked directly against both tools' real source (not assumed),
following the pattern this project always uses before committing to a design:

- **mangabind** ([ADR 0012](https://github.com/gustavommcv/mangabind/blob/main/docs/adr/0012-combine-series-into-one-volume.md)):
  a new `-combine` flag writes one `.cbz` for the whole manga instead of one per volume, nesting
  each volume as one more directory level above its chapters. Its own chapter-grouping logic is
  completely unchanged; only the final write differs. The machine report gains one purely additive
  field, `combined_output_path` — no protocol version bump.
- **mangapress** ([ADR 0012](https://github.com/gustavommcv/mangapress/blob/main/docs/adr/0012-nested-toc-for-combined-volumes.md)):
  a new `--nested-toc` flag reads that same two-level structure and builds a nested `toc.ncx`/
  `nav.xhtml` — a volume parent entry, its chapters as children — instead of today's flat list.
  Checked per output format, not assumed: EPUB's hand-built XML already supports nested entries by
  the format's own spec, a template change. PDF is structurally blocked: the vendored `printpdf`
  crate's bookmark API hardcodes every bookmark's parent to the document root at serialize time,
  so true nested bookmarks aren't reachable through it. CBZ has no chapter-boundary metadata
  written into it at all today, and whether any reader (KOReader included) could render a
  two-level view from one is unverified. mangapress itself refuses `--nested-toc` combined with
  `--format cbz` or `--format pdf` with a structured error, rather than silently ignoring it.

Neither tool needed a new communication channel with the other: mangabind already reported
per-volume chapter lists, and it and mangapress are only ever glued together by mangabound handing
one a file path and reading the other's output. Volume boundaries ride the same archive folder
structure chapter boundaries already do, one level deeper.

## Decision

- `MangapressSettings` gains `combineIntoOneVolume: boolean` (default `false`).
- A new constant, `FORMATS_SUPPORTING_COMBINED_VOLUME` (`src/domain/output-profile.ts`), is the
  **single** place the EPUB-only restriction lives: `new Set(['epub'])` today. Widening it later,
  once mangapress supports another format, is exactly one edit there — nothing else needs to
  change to lift the restriction.
- `validateMangapressSettings` now also takes the chosen `format` and rejects
  `combineIntoOneVolume: true` paired with a format outside that set. This is defensive: the
  settings UI is expected to keep the combination from happening at all.
- The settings UI (`mangapress-settings.tsx`) enforces it two ways, matching ADR 0009's existing
  "the interface shows what will and will not run" principle:
  - Checking the box while on CBZ or PDF switches the format to EPUB and shows a short notice
    explaining why, through the same mechanism already used for the device-profile and
    output-folder fallbacks.
  - The CBZ and PDF format options are `disabled` (not hidden) while the box is checked, so they
    stay discoverable but cannot be chosen.
- `SingleInputWorkflow.convert` only asks mangabind to combine when mangapress will actually run
  (`usesMangapress(mode)`): mangapress settings are already irrelevant, and the renderer already
  sends their defaults, whenever it will not (ADR 0009) — `bind-only` stays one file per volume
  regardless of this setting, since there is no table-of-contents step to build it for.
- `BindingPort.bind` gains a trailing optional `combine?: boolean` parameter and `BindingResult`
  gains an optional `combinedOutputPath`, set instead of `volumePaths` having one entry per volume.
  `ConversionPort`'s existing `settings` field already carries `combineIntoOneVolume` through to
  the mangapress adapter, which translates it to `--nested-toc` — no new port surface needed there.

## Consequences

The checkbox, the domain validation, the adapters, and the workflow branch are complete and fully
tested (100% coverage gate, component tests, an interaction-tested Storybook story) — but **not
yet reachable end to end**. `toolchain.lock.json` still pins the mangabind and mangapress releases
that predate `-combine`/`--nested-toc`; re-pinning needs real, tagged releases of both tools first,
following the existing `npm run toolchain:update` process
([CONTRIBUTING.md](../../CONTRIBUTING.md#updating-the-bundled-tools)). That is a deliberate,
separate, user-approved step — publishing a release of either tool is a more public, harder-to-
reverse action than the code in this ADR, and is not taken as a side effect of implementing a
feature.

PDF and CBZ stay exactly as capable as before. Nothing here blocks widening this later — a PDF
library swap or a real CBZ/reader compatibility test are separate, independent pieces of work.
