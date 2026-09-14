# ADR 0005: Product responsibilities, capabilities, and anti-goals

- Status: Accepted
- Date: 2026-09-14

## Context

Mangabound is a capable workflow application, not a general manga platform. Its boundaries must remain explicit as implementation conveniences appear.

## Decision

Mangabound accepts exactly three top-level input workflows:

- one HakuNeko/user-produced manga folder;
- one CBZ file;
- a batch of manga folders, exposing mangabind batch behavior.

Batch and metadata-file modes retain mangabind's mutual-exclusion rule. Each manga in a batch is a separate job with independent progress and failure isolation.

Manual chapter-to-volume editing is a first-class flow. It starts from raw parsed chapters and can build volumes without any provider lookup. MangaDex is an optional suggestion source using the same editor; its result is never required or authoritative.

Confirmed mappings serialize to mangabind's actual `mangabind.json` shape: `schema_version`, optional `manga.title`, and `volumes` containing a number and chapter assignments. `source` is an optional `{ provider, id }` object and is omitted for wholly manual mappings.

The interface exposes the entire supported flag surface of mangabind and mangapress. Common settings use approachable controls; advanced and diagnostic sections retain less common options, dry runs, metadata files, batch controls, and safe command previews. Mangapress controls are grouped into device, layout, image processing, metadata, output, and execution sections. Contextually invalid options remain visible but disabled with an explanation. Device output profiles contain mangapress conversion settings, and the output-library location is configurable. The present meaning of customizable excludes themes and extensions.

Volumes convert sequentially by default. Every job and diagnostic carries the tool, severity, stable code, stage, manga, volume, chapter, page, path, recoverability, actionable message, and optional safe details where applicable. Field and item problems appear inline, transient confirmations use toasts, job-wide failures use a persistent summary, and a dedicated activity view retains structured events. Raw stdout/stderr is available only in an explicitly opened diagnostic detail and is never the primary error message. Modal decisions are reserved for execution that genuinely cannot continue.

The OPDS 1.2 catalog includes a newest-converted-first acquisition feed and a dedicated recently converted navigation entry, with deterministic timestamps and ordering. Its server binds only to a user-selected LAN interface, uses a random token or optional Basic authentication, follows the app lifecycle, and is never publicly exposed by default. Calibre push is deferred.

Opening a source or generated book delegates to Electron `shell.openPath`; locating it delegates to `shell.showItemInFolder`. The renderer sends an artifact identifier through a narrow IPC command; main resolves and verifies the registered path, so the renderer can never request an arbitrary path. A non-empty `openPath` result is converted into an actionable error. Windows uses the registered file association, macOS Launch Services, and Linux the desktop's default opener/association. Missing associations, quarantined or blocked applications, sandbox/portal restrictions, and unavailable paths must be surfaced; Mangabound does not choose or embed a reader.

## Anti-goals

- No integrated manga reader, page renderer, preview pane, or reader mode.
- No integrated downloader, HakuNeko control, scraping, or chapter acquisition.
- No theming system in v1.
- No third-party plugin or script execution system.
- No arbitrary user-programmable pipeline graph.
- No silent presentation of raw CLI output as a user-facing error.

These are architectural guardrails. Adding any of them requires an explicit superseding ADR, not an opportunistic component or hidden experimental switch.
