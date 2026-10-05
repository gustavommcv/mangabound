# ADR 0025: "Single Book for the Series" Workflow-Level Mode and Option Coupling

- Status: Accepted
- Date: 2026-09-27
- Amends: [ADR 0024](0024-combine-into-one-volume-is-epub-only.md) (Bind the whole series as one volume, EPUB only for now)

## Context

ADR 0024 introduced the ability to bind an entire series into a single output file with a two-level table of contents (volumes as top-level entries, chapters nested underneath), utilizing mangabind's `-combine` flag and mangapress's `--nested-toc` flag.

In ADR 0024, the control was initially placed inside the mangapress options panel as a setting (`combineIntoOneVolume`). However, practical experience and workflow analysis revealed that:

1. Creating a single book for the series is a pipeline-level orchestration decision that fundamentally dictates both the binding stage (`mangabind`) and the conversion stage (`mangapress`). It is not an internal image-processing parameter of mangapress.
2. Placing the toggle inside the secondary mangapress options screen hid a primary workflow decision, created risk of conflicting states, and complicated reset actions.
3. In library batch processing, "single book for the series" must mean **one EPUB per manga title/series** in the library (never merging the whole multi-series library into a single monolithic file).
4. Single-book mode strictly requires both binding and conversion (`mode === 'bind-and-convert'`) and format `epub`. Allowing users to deselect steps or choose non-EPUB formats while single-book mode is active creates invalid pipeline states.

## Decision

### 1. Centralized Workflow Control on Home Screen

- The primary toggle lives directly on `QueueScreen` adjacent to the Process Steps control: `id="combine-into-one-volume"`, with label `"Create one book for the series"` and description `"Produces a single EPUB with volumes and chapters in the table of contents."`.
- When the queue contains solely standalone `.cbz` files, the control is disabled with the explanation `"Not available for standalone .cbz files."`, as loose CBZs have no chapter structure to group or nest into a series book. In mixed queues, the option remains available; folders follow single-book mode while CBZ files convert individually.
- The toggle checkbox is removed from within `MangapressSettingsEditor` to prevent duplicate controls and conflicting states.

### 2. Informative Indicators Across Contexts

- Across `MangapressSettingsEditor`, `MappingEditor`, and `LibraryScreen`, a shared, non-dismissible `InfoBanner` component displays the mode status consistently:
  - In `MangapressSettingsEditor`, the banner appears at the very top of the screen before the setting sections, stating that single-book mode is active from the queue and that format and process steps are locked.
  - In `MappingEditor`, the banner explains that the volumes mapped in the editor will form the top-level divisions of the unified EPUB's table of contents. Furthermore, the "Skip grouping" action is disabled when single-book mode is active to prevent bypassing the required mangabind grouping.
  - In `LibraryScreen`, the banner informs the user that each title in the library will be produced as its own single-series EPUB.

### 3. Option Coupling and Locking

- Activating single-book mode forces:
  - Process steps: `bind-and-convert` (`mangabind + mangapress`).
  - Book format: `epub`.
- While single-book mode is active:
  - Deactivating either step in `ProcessSteps` is blocked.
  - Changing format away from `epub` in `QueueScreen` or `MangapressSettingsEditor` is blocked.
  - Individual reset buttons for Steps and Format are disabled.
  - The lock reason is clearly displayed: `"Turn off “Create one book for the series” to change this."`.
  - Unrelated mangapress options (device profile, rotation, cropping, etc.) remain fully editable and resettable.

### 4. State Ownership and Reset Lifecycles

- Single-book mode belongs to workflow preferences (`Preferences.singleBook`), not to isolated mangapress settings.
- Stored settings migration: legacy configurations containing `combineIntoOneVolume: true` (either at root or inside `settings`) automatically migrate to `singleBook: true`, and the legacy setting key is normalized and cleared to ensure `Preferences.singleBook` remains the single source of truth. Turning off single-book mode reliably persists `singleBook: false` across restarts.
- "Reset options" in the mangapress options screen resets format and mangapress settings, but **does not** touch `singleBook` (or process mode).
- "Reset to defaults" resets all preferences, including `singleBook` back to `false` and mode back to `defaultProcessMode`.

### 5. Non-UI Pipeline Enforcement

- Both `SingleInputWorkflow.convert` and `SingleInputWorkflow.plan`, as well as IPC handlers, validate and reject invalid combinations (`singleBook` with non-EPUB or mode other than `bind-and-convert`).
- Single `.cbz` inputs never receive `--nested-toc` (CBZs bypass grouping). In a mixed queue, folders follow single-book mode while CBZ files convert normally without error.

### 6. Library Batch Processing

- When converting a library in single-book mode, mangabound passes `combine: true` to `BindingPort.bindBatch`, which invokes mangabind with both `-batch` and `-combine`. When only some titles of the library are converted (a re-run of the ones that failed), `BindingPort.bindTitles` runs mangabind with `-combine` on each of their folders instead, so the rest of the library is not bound (audit P2-02).
- Each completed title's `combined_output_path` is converted once to EPUB with `nestedToc: true`.
- Per-title failure isolation is strictly preserved: a failure in one title's binding or conversion does not interrupt processing of remaining titles.
- Temporary workspaces are guaranteed to be cleaned up via `finally` blocks.

## Consequences

- The pipeline decision is prominent and unambiguous for the user.
- Invalid configurations are prevented in both the UI and domain/workflow validation layers.
- Full failure isolation and resource cleanup across batch and single-file workflows.
- 100% test coverage gate is maintained across all metrics (statements, branches, functions, lines).
