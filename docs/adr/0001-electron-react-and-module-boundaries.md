# ADR 0001: Electron, React, TypeScript, Forge Webpack, and module boundaries

- Status: Accepted
- Date: 2026-09-14

## Context

Mangabound needs a deliberately designed cross-platform desktop interface, controlled subprocess execution, safe OS integration, and packaging for Windows, macOS, and Linux. It must remain easy to extend with a concrete second metadata provider, delivery mechanism, or output library without becoming a speculative plugin platform.

Electron Forge's Vite integration is still documented as experimental. Stability is more valuable than a marginally faster development build at this stage.

## Decision

Use the latest stable Electron with React and strict TypeScript in an independent repository. Package it with Electron Forge and the stable Webpack plugin.

Use an opaque native window with a custom HTML title bar. Retain native window controls through Electron's title-bar overlay behavior, reserve draggable regions explicitly, and keep all interactive elements out of draggable regions. Do not use transparent windows.

Separate code by responsibility and direct dependencies inward:

- `domain`: immutable business concepts and rules; no Electron, React, filesystem, process, or network imports.
- `application`: use cases and ports; coordinates domain behavior without infrastructure details.
- `adapters`: mangabind, mangapress, metadata-provider, delivery, filesystem, and process implementations of application ports.
- `library` and `opds`: output-library indexing and catalog behavior behind application-facing interfaces.
- `main`: Electron lifecycle, privileged IPC handlers, process ownership, and OS integration.
- `preload`: the narrow, typed renderer bridge.
- `renderer`: React screens, view models, and the shared design system; no direct Node.js access.
- `shared`: serializable IPC contracts and cross-process value types only.

Provider, delivery, and library variability are represented by small interfaces where the first implementation actually needs a boundary. There is no dynamic plugin loader, service locator, or generalized pipeline graph.

Electron security defaults are mandatory: context isolation on, renderer sandbox on, Node integration off, navigation denied, new-window creation denied unless explicitly allowlisted, and IPC payload validation at the main-process boundary.

## Consequences

The renderer cannot directly spawn a process or open a file. It requests a typed use case through preload and main. A second real provider, delivery target, or library implementation can be added behind the relevant port without changing domain rules or every screen.

Webpack is less fashionable than Vite but is the supported Forge path. Reconsider Vite only through a new ADR after Forge removes the experimental designation and the migration has a measurable benefit.

Wayland behavior cannot be inferred from X11 behavior. Release CI and manual platform checks must cover both compositors, including native controls, dragging, maximizing, focus, scaling, and tiling-window-manager behavior.
