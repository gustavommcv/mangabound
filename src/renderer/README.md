# Renderer

The React app. It has no Node access: everything outside the page goes through the typed `MangaboundBridge` interface.

- `app.tsx` is the desktop entry: it reads `window.mangabound` and either supplies it to `WorkflowApp` or shows startup recovery instructions. A missing preload is an error, not a scaffold preview.
- `workflow-app.tsx` holds the state (the queue, the options, the step on screen) and wires the screens together. Its bridge is a required prop; it never reads `window.mangabound`, so another entry can supply an implementation of the same interface. It is the one place that calls the bridge for a run. It applies the pure decisions from `domain/run-report.ts`: per-input and per-title results, cancellation, omitted rows and completed rows. The bridge calls, session release and React state updates stay here; the report owns none of them. Navigation, inline options, effects and progress state still live here pending the next audit items.
- `screens/` are whole steps: the queue, a library's titles, the title, author and language of an item, the running item, the results.
- `components/` are grouped by what they are for: `mapping/` (the volume editor), `queue/` (the rows and the drop area), `settings/` (the process steps, the mangapress options, reset), `sharing/` (the one Share panel and the button that opens it), `shell/` (the title bar), `shared/` (notices and other compositions used across screens), and `ui/` (the design-system primitives: button, input, tabs, menu, and so on).
- `lib/` is pure helpers, under the 100% coverage gate.
- `hooks/` is React hooks shared across components, such as `useClickOutside`. They touch the DOM and React's own lifecycle, so they are covered by component tests instead of the node-environment unit gate `lib/` uses.
- `styles.css` holds the design tokens (ADR 0002). The theme is one fixed graphite dark with a lavender accent; nothing else defines a color.

Every component and screen is meant to have a Storybook story next to it, with the accessibility check running on each one; `docs/audit-2026-09.md` tracks the current gaps.
