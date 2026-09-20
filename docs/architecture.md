# Architecture overview

This is the map: where things live, how a conversion travels through them, and where to make a change. The reasons behind each choice are in [the decision records](adr/README.md); [ADR 0001](adr/0001-electron-react-and-module-boundaries.md) is the one for the layout below.

## The idea in one paragraph

Mangabound does not reimplement chapter grouping or image conversion. Those are the jobs of two command-line tools it bundles, **mangabind** and **mangapress**, pinned to exact releases and verified before anything runs ([ADR 0003](adr/0003-bundled-version-pinned-cli-binaries.md), [ADR 0006](adr/0006-cli-first-tool-boundary.md)). The app orchestrates them: it reads their structured output, keeps the person's choices, and shows what is happening. Code is layered so that the rules do not depend on Electron or React, and dependencies point inward: adapters know about the application, the application knows about the domain, the domain knows about nothing.

## Layers

| Folder                    | What lives there                                                                                                                                                                                                   | May import                            | Tested by                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------- |
| `src/domain`              | Pure rules: the chapter-to-volume mapping and its validation, undoable editing commands, the input queue, mangapress options and the device defaults, process modes, saved preferences                             | nothing                               | unit, under the 100% coverage gate                                |
| `src/application`         | The use cases and the small interfaces (ports) they need: `single-input` (read, plan and convert a folder, a CBZ or a library), `preferences`, `library-publisher`                                                 | domain                                | unit, under the gate                                              |
| `src/adapters`            | The implementations of those ports: the mangabind and mangapress adapters and their protocol parsers, the process runner, online sources, the library and settings stores, the OPDS server, toolchain verification | application, domain, `shared` schemas | unit, under the gate                                              |
| `src/library`, `src/opds` | Pure library-catalog and OPDS-feed logic that adapters wrap                                                                                                                                                        | domain                                | unit, under the gate                                              |
| `src/shared`              | The IPC contracts: zod schemas and the types both sides of the window share                                                                                                                                        | domain                                | unit (schemas), outside the gate                                  |
| `src/main`                | Electron's main process: builds the adapters, registers the IPC handlers, owns every path and id, opens the window                                                                                                 | everything below it                   | packaged e2e                                                      |
| `src/preload`             | The typed bridge `window.mangabound`, the only way the page reaches the main process                                                                                                                               | `shared`                              | packaged e2e                                                      |
| `src/renderer`            | The React app: `app.tsx` holds the state and wires screens together; `screens/`, `components/` draw it; `lib/` has pure helpers                                                                                    | domain, `shared`                      | component tests, Storybook, visual and e2e; `lib/` under the gate |

Two rules follow from this and are checked in review: **the renderer never touches Node** (it is sandboxed, context-isolated, and has no filesystem or process access), and **the domain imports nothing from Electron, React, Node or any adapter**.

## A conversion, step by step

1. **Add.** A folder or file comes from a native dialog or from files dropped on the window. The preload reads a dropped file's path, and the main process checks every path against the disk (`classifyInputPaths`), then hands the page an opaque _selection id_. From here on the page names things by id, never by path.
2. **Read.** `inspectInput(selectionId)` runs `SingleInputWorkflow.inspect`: mangabind is run in dry-run mode on a scratch copy and its own grouping seeds a `MappingDraft` ([ADR 0008](adr/0008-mapping-starts-from-mangabind-grouping.md)). The page gets a _session id_ back. A folder that turns out to be a library of manga folders is read as one and named by session ([ADR 0012](adr/0012-libraries-in-the-queue.md)).
3. **Edit.** The volume editor changes the draft through one undoable command boundary (`domain/mapping-editor`). Where the grouping came from does not matter: the file names, an online source and manual edits all end up as the same draft.
4. **Run.** The renderer walks the runnable queue rows one after another and sends `convert` with the session id, the output _library id_, the options and the confirmed draft. Main validates the command with its zod schema, looks the library path up by id, and calls the workflow: mangabind writes the volumes into a scratch workspace, then mangapress converts each one into the library. Progress events flow back to the page; cancelling aborts the process.
5. **Publish.** Each finished book is written into the output library and recorded in that library's catalog (`.mangabound/library.json`), keyed by its path, so a reconversion replaces its entry ([ADR 0007](adr/0007-library-indexing-and-opds-delivery.md)).
6. **Use.** The results screen opens a book or shows it in its folder by _artifact id_. Sharing starts the OPDS server on the network interface the person chose, and it stops when the app quits. There is one place that sets it up, the Share panel that the button in the title bar opens; the results screen opens that same panel with the folder just saved to already chosen ([ADR 0016](adr/0016-one-share-panel-fixed-title-bar-clickable-drop-area.md)).

## What keeps it safe

- The window is sandboxed with context isolation on, Node integration off, navigation and new windows denied.
- Every IPC payload is validated against a zod schema in the main process before it is used.
- The page holds no paths it typed or was handed, apart from the dropped files the preload resolves and main re-checks. A folder to save to, a session, a title in a library and a saved book are all ids that main resolves.
- An online source can only search by title and list a work's volumes. The port has no way to ask for chapters, pages or images ([ADR 0013](adr/0013-online-sources-for-volume-data.md)). Opening a source's homepage takes the source's id; the address comes from the registry, never from the page.
- The two bundled tools are verified against `toolchain.lock.json` (checksums, versions, protocol handshake) before any job can start; if they do not match, the app says so and does not convert.

## What is kept between runs

- **Options and the output folder** are in `settings.json` in the operating system's per-user app data folder, written atomically and read once at launch ([ADR 0014](adr/0014-persisted-settings-and-reset.md)).
- **Each output library's catalog** is `<library>/.mangabound/library.json`.
- Nothing else is: the queue, the drafts and the sessions are gone when the app closes, and the scratch workspaces are removed with them.

## Where to change what

| To…                                        | Touch, in this order                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offer another online source                | Follow [the provider guide](adding-a-metadata-provider.md): one folder under `src/adapters/metadata-providers/` and one line in the registry.                                                                                                                                                                                            |
| Add or change a mangapress option          | `MangapressSettings` and its validation in `domain/output-profile`, the schema in `shared/workflow-contract`, the arguments in `adapters/mangapress/arguments`, the control in `renderer/components/settings/mangapress-settings`, then the tests. `npm run capabilities:check` fails when a tool has a flag the app does not represent. |
| Add an IPC command                         | The schema in a `shared/*-contract` file, the method on the bridge type in `shared/runtime-info` and in `preload/index`, the handler in `main/index` (validate first, name things by id), the call in the renderer, then the tests.                                                                                                      |
| Add a screen or a component                | A file under `renderer/screens` or `renderer/components`, a story next to it, a component test. New visual baselines come from the CI artifact ([CONTRIBUTING](../CONTRIBUTING.md#storybook-what-it-is-and-how-it-is-used-here)).                                                                                                        |
| Change how a use case behaves              | The workflow in `src/application/workflows` and, if it needs something new from the outside world, a port in `src/application/ports` with an adapter behind it. The domain stays pure.                                                                                                                                                   |
| Record a decision that changes any of this | A new ADR. Accepted ADRs are never rewritten; a reversed decision gets a new one that says so.                                                                                                                                                                                                                                           |

## Tests, by layer

| Kind                                | Tool                                 | What it holds                                                                                                                   |
| ----------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit`                        | Vitest, Node                         | Domain, application, adapters, library, OPDS and `renderer/lib`, with recorded real responses and fixtures. 100% coverage gate. |
| `tests/component`                   | Vitest, jsdom, React Testing Library | Components and the whole `App` against a fake bridge: what a person sees and can do.                                            |
| Storybook stories (`*.stories.tsx`) | Storybook with Vitest and axe        | Every screen and state on its own, their interactions, and a WCAG A and AA accessibility check that fails the build.            |
| `tests/visual`                      | Playwright                           | Screenshots of the stories compared with the baselines in `tests/visual/__screenshots__`.                                       |
| `tests/e2e`                         | WebdriverIO against the packaged app | The real window with the real tools: reading, converting, sharing, saving options, the title bar.                               |
