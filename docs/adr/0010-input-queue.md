# ADR 0010: The entry screen is a queue of folders and comic files

- Status: Accepted
- Date: 2026-09-19
- Amends: [ADR 0005](0005-product-boundaries-and-anti-goals.md) (how inputs are brought in and how a run is shown), [ADR 0007](0007-library-indexing-and-opds-delivery.md) (how the saved books are offered to a reader)

## Context

The first interface was a wizard: pick one kind of input on a home screen, walk through mapping, settings and a confirmation, get one result, start over. Hands-on testing showed it was the wrong shape for a converter. People arrive with several folders or files, expect to drop them on the window, and want to see what each one will do before anything runs. The reference the product was measured against is a two-pane converter: a list of inputs on the left, the options for the whole run on the right, one button.

## Decision

- **The entry screen is a queue.** Manga folders and `.cbz` files are added with the Files and Folder buttons (native pickers that take several at once) or by dropping them on the queue. The right pane holds what applies to the whole run: the two steps (ADR 0009), the device, the format, the output folder, the mangapress options and one primary button, "Convert N items" (or "Join N items" when only joining).
- **Every row describes itself.** Adding a row reads it once (mangabind's scan for a folder, a check for a file), one row after another, and the row then says what a run would do with it: how many volumes, "Needs volumes", "One book", "Ready", "Nothing to join", "Not recognized", "Could not read". The description is a pure function of the row and the chosen process (`describeRow`), so the queue and the results agree.
- **A run processes what is ready, and reports the rest.** Rows run one after another, each as its own job with its own progress. A row that is not ready (a folder with chapters still unassigned, a CBZ under a join-only run) is left out with the reason, and a folder that only needs volumes has a "Fix" that opens its editor. Rows that were saved leave the queue and release their scratch copy; rows that failed or were left out stay, so they can be fixed and run again. A cancelled run stops at the current row.
- **One process for the whole queue.** The steps, device, format and mangapress options apply to every row. There are no per-row overrides: they are how a pipeline graph creeps in (ADR 0005), and the closed set of three processes is what keeps the queue explainable. A row the chosen process does not apply to is left out and says so, instead of being converted differently from what was asked.
- **A plan can be validated first.** "Validate plan" asks each ready row for its dry run and shows the books that would be written; nothing is written. The result is tied to the queue, the process and the settings it was made for, and disappears when any of them changes.
- **A folder edited by hand is a decision.** Accepting a mapping in the editor with chapters still unassigned makes the folder ready with those chapters left out, and the row says how many. Without that decision it stays "Needs volumes" and does not run.
- **A dropped file is a trust downgrade from a dialog, so it is checked twice.** The preload reads each dropped `File`'s path with `webUtils.getPathForFile`, so a path never comes from renderer script. The main process treats the paths as untrusted: each is `stat`-ed, only directories and `.cbz` files become inputs, at most 100 are taken per add, and every accepted input is registered under an id the renderer refers to from then on. What was not accepted comes back with the reason, and the queue shows it. The same check serves the native pickers.
- **The queue is not offered to a library yet.** A folder of manga folders is still added through a temporary Library button that opens the earlier batch review. Folding libraries into the queue means telling a manga folder from a library reliably and registering the library like any other input, and it lands as its own change so this one stays reviewable.
- **Sending to a reader is one click from the results.** The results screen lists each book saved with Open and Show in folder, warns about anything left out, and offers a "Send to KOReader" card that serves the output folder with a random token on the chosen network and shows the address to add to KOReader. It reuses the OPDS server as it was decided in ADR 0007; choosing another folder or Basic authentication stays in the Share panel.

## Consequences

The interface matches how the product is used: bring things in, see what each will do, run. What the first version could not say (why a folder did not convert, what was left out) is on the screen before and after a run.

Known limits, left as they were: the chosen steps, device and format are kept for the session but not between sessions, which waits for the settings decision; the title and author of a book cannot be set per row, and are the values mangapress derives; a library is not a queue row yet; and a run is sequential, so a long queue takes as long as its parts. A native drag of a folder cannot be scripted, so the end-to-end suite puts real files in a file input and drops them with the events a drag produces, which exercises the page, the preload's path resolution and the main process; that a dragged _directory_ arrives as a path is checked by hand in the release checklist.
