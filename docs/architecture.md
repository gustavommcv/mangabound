# Architecture overview

This page maps the code and the conversion flow. [ADR 0001](adr/0001-electron-react-and-module-boundaries.md) defines the boundaries; the [decision index](adr/README.md) explains the trade-offs.

## The idea in one paragraph

Mangabound orchestrates two bundled, version-pinned tools: **mangabind** groups chapters and writes volumes; **mangapress** processes pages and creates books. The app handles choices, progress, saving, and sharing rather than reimplementing those algorithms. Dependencies point inward: adapters implement the application's ports, the application coordinates domain rules, and the domain has no framework or infrastructure dependencies.

## Layers

| Folder                    | Responsibility                                                         | May import                                 |
| ------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ |
| `src/domain`              | Pure mapping, queue, settings, and run-result rules                    | nothing                                    |
| `src/application`         | Workflows and the ports they require                                   | domain, library, opds                      |
| `src/adapters`            | CLI, process, filesystem, provider, and network implementations        | application, domain, shared, library, opds |
| `src/library`, `src/opds` | Pure catalog and feed logic                                            | domain, library, opds                      |
| `src/shared`              | Validated IPC contracts and shared bridge types                        | domain                                     |
| `src/main`                | Electron wiring, windows, trusted paths, ids, and command registration | all layers below it                        |
| `src/preload`             | The typed `window.mangabound` bridge                                   | domain, shared                             |
| `src/renderer`            | React screens, state, components, and UI helpers                       | domain, `shared`                           |

The table lists allowed project layers; imports within a layer are always allowed. The renderer has no Node, filesystem, or process access. Domain code imports no React, Electron, Node, or adapters. ESLint enforces these boundaries; [CONTRIBUTING](../CONTRIBUTING.md#module-boundaries) explains the checks.

`app.tsx` reads the desktop bridge and reports startup failure if it is missing. `WorkflowApp` receives the bridge, owns workflow state, and connects controlled screens. Navigation identifies the current queue item or library title without keeping a second copy of its draft.

## A conversion, step by step

1. **Add.** Native dialogs or dropped files supply paths. Main validates them and returns opaque selection ids to the renderer.
2. **Inspect.** For a folder, mangabind runs a dry-run on a scratch copy to seed the mapping or discover a library. A standalone CBZ needs no grouping. Each input receives an application-owned session.
3. **Review.** File-name grouping, optional online suggestions, and manual edits use the same undoable mapping model. Book details belong to each item; a folder's author and language are kept in its `mangabind.json`.
4. **Process.** Main creates a durable pending run and validates the selected steps. When enabled, mangabind builds volumes and mangapress converts them through a bounded worker pool in isolated staging folders. Completed books are published under unique names in volume order; progress comes from the tools, cancellation reaches active processes, and partial successes remain available.
5. **Save.** Each book is indexed in the pending run. Save As or Save All copies it to a chosen destination and records the export. Save All never replaces existing files; an indexing warning retains the pending original for retry.
6. **Open or share.** Books open in the OS default application. An opt-in OPDS server serves a pending run or selected library on the chosen interface and a fixed port, and stops on exit. It lists recently converted books and other supported files separately.

Grouping and conversion can run together or separately. For chapter folders, single-book mode requires both steps and EPUB; a standalone CBZ already represents one book and bypasses grouping. The workflow entry point is `application/workflows/conversion-workflow.ts`; its owners are described in [the application guide](../src/application/README.md). Concrete tool and storage implementations are listed in [the adapter guide](../src/adapters/README.md).

## What keeps it safe

- The window is sandboxed and context-isolated, with Node integration, external navigation, and new windows disabled. Its own `app://` scheme and CSP limit access; only clipboard-write permission is allowed ([ADR 0041](adr/0041-the-window-loads-its-page-from-its-own-scheme.md)).
- Shared schemas validate IPC commands before execution. Main resolves session, run, and artifact ids to trusted paths; the renderer cannot request arbitrary filesystem access. Catalog entries are checked to stay within their library, including when OPDS opens them.
- Bundled-tool hashes, versions, and protocol handshakes are verified before processing. A mismatch blocks conversion.
- Sharing starts only on a local network interface. Online providers supply metadata, not manga pages; the app has neither a downloader nor an integrated reader.

## What is kept between runs

- **Preferences:** device/options, the last save-dialog folder, and the chosen sharing interface live in per-user `settings.json`. A remembered folder is a suggestion, not an automatic output destination.
- **Pending books:** isolated directories under persistent local app data, not OS temporary storage. Unsaved, partly saved, and warning-affected runs survive restart. Successfully exported runs are cleaned up on exit; explicit deletion never deletes exported copies and is refused while the run is in use.
- **Library catalogs:** `<library>/.mangabound/library.json` records completed books for sharing.
- **Folder metadata:** `mangabind.json` retains the author and language beside the input.

Queue drafts and sessions are not restored; scratch workspaces are cleaned up. The catalog, saved-state, settings, and metadata writers share atomic file replacement. This protects an individual write, not a transaction across files or a guarantee against power loss. [ADR 0026](adr/0026-process-then-save-pending-books.md) records the pending-book lifecycle.

## Where to change what

| Change                           | Start here                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Another online source            | [Provider guide](adding-a-metadata-provider.md), its adapter, and the registry                                  |
| A converter option               | Domain settings/validation, shared schema, CLI arguments, settings control, and tests; run `capabilities:check` |
| An IPC command                   | Shared contract/bridge, preload, validated registration in `main/ipc`, renderer call, and tests                 |
| A screen or component            | `renderer/screens` or `renderer/components`; reuse shared controls and add component/story coverage             |
| A use case                       | `application/workflows`; add a port and adapter only for an actual infrastructure need                          |
| A lasting architectural decision | A new [ADR](../CONTRIBUTING.md#writing-an-adr), preserving accepted history                                     |

## Tests, by layer

| Layer                                                                                       | Tests                                                                                                 |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Domain, application, adapters, library, OPDS, renderer helpers, selected main/preload units | Vitest with real fixtures and recorded responses; 100% coverage on files listed in `vitest.config.ts` |
| React behavior                                                                              | React Testing Library against a fake bridge                                                           |
| UI states                                                                                   | Storybook interactions and axe accessibility checks; Playwright visual baselines                      |
| Critical desktop flows                                                                      | WebdriverIO against the packaged Electron app and real converters                                     |

These are complementary checks, not a claim of whole-app 100% coverage. [CONTRIBUTING](../CONTRIBUTING.md#testing-expectations) describes the commands and expectations.

## Documentation website

The independent Astro/Starlight package under `website/` imports no application modules. CI captures selected Storybook states from the same source commit and shares that artifact with site checks and publication. Astro produces responsive, losslessly optimized images; KOReader captures remain manual. Tutorial images do not replace visual baselines or enter the app installer.

The guide and app captures follow `main`, not release tags ([ADR 0034](adr/0034-tutorial-images-from-the-site-source-commit.md)). Development, media, indexing, and dependency-audit details live in [website/README.md](../website/README.md), [MEDIA.md](../website/MEDIA.md), [SEO.md](../website/SEO.md), and [website/SECURITY.md](../website/SECURITY.md).
