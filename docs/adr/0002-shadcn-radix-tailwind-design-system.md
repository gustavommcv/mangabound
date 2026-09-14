# ADR 0002: shadcn/ui, Radix, Tailwind, and one tokenized design layer

- Status: Accepted
- Date: 2026-09-14

## Context

Visual quality is a product requirement. Mangabound must look intentional and consistent without inheriting a strong vendor identity or maintaining accessibility primitives from scratch.

## Decision

Use shadcn/ui component source built on Radix UI primitives, Tailwind CSS v4, and Lucide icons. Components copied into the repository are owned and reviewed as application code.

Define the visual language once in the renderer stylesheet and Tailwind theme:

- semantic color roles, including foreground, surface, border, and one status vocabulary for pending, running, warning, failed, cancelled, and complete;
- a bounded spacing scale;
- typography families, sizes, weights, and line heights;
- radius and elevation levels;
- focus-ring treatment;
- motion durations and easing curves, with reduced-motion behavior.

Screens consume semantic utilities and shared compositions. They must not introduce arbitrary colors, shadows, radii, font sizes, animation durations, or one-off pixel values. A new value enters the shared token layer only when it represents a reusable design decision.

Use Storybook to cover reusable states: normal, loading, empty, disabled, warning, and error. Run automated accessibility checks and deterministic screenshot comparisons for representative stories. Use React Testing Library to exercise labels, roles, buttons, focus, and keyboard actions rather than component internals.

## Consequences

shadcn/ui does not impose a runtime theme or ship unused components, but copied source does not update itself. Component additions and upstream refreshes are normal code changes and receive the same review, tests, and visual-regression checks as other UI code.

The choice changes the styling layer only. It does not alter process boundaries, error contracts, full CLI capability exposure, batch workflow, testing requirements, or the reader/downloader anti-goals.
