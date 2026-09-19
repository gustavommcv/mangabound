# ADR 0012: A library is a row in the queue

- Status: Accepted
- Date: 2026-09-19
- Amends: [ADR 0010](0010-input-queue.md) (which left libraries out of the queue), [ADR 0005](0005-product-boundaries-and-anti-goals.md) (how a batch of manga folders is exposed)

## Context

ADR 0010 made the queue the entry screen for folders and comic files, and left a library (a folder of manga folders) on a temporary button that opened the earlier batch review. That flow also still sent raw paths across the IPC boundary: the library's folder to read it, to convert it and, for each title, the folder to write a mapping in. Everything else in the queue already refers to what the main process registered by id.

Checked against the pinned mangabind 0.4.0 (ADR 0006 discipline), on a library of two manga folders:

- Read as one manga (no `--batch`), a library exits 0 with a single manga named after the folder, whose units are the manga folders. None parses as a chapter, and each has no pages of its own, because `page_count` counts a folder's direct pages only. A child named like a chapter (say "Mob Psycho 100") parses as one, still with no pages.
- Read with `--batch`, the same folder lists each manga folder as a title, with its chapters and the volumes mangabind would make.
- A manga folder holds chapters that have pages. So "does any chapter have pages" separates the two reads.

## Decision

- **A library is added like any folder.** The Folder button and a drop take it; there is no separate picker or button. It is only known to be a library once read.
- **Reading tells them apart, at most twice.** A folder is first read as one manga. If any chapter in that read has pages, it is one manga and nothing more is read. Otherwise it is read once more with `--batch`, and it is a library only if that finds manga that have chapters. A folder that is neither stays a folder, which says it has no chapters in it, and a failure of the second read is not an error: it just means the folder is not a library. A cancellation is passed on.
- **The row shows what a run would do.** `Library · 3 titles · 4 volumes`, with a chip counting the titles that would run. A run makes books of the titles that have volumes and were not already saved; titles without volumes are left out, with the reason and a way to fix them, as a folder with unassigned chapters is.
- **A pencil opens the library's titles.** Each title shows how many volumes it would make, or that it needs some, or that it was saved or failed. Editing a title uses the same volume editor as a folder, saves the mapping as that title folder's `mangabind.json` and reads the library again, keeping what was already saved.
- **A run is one join for the library, then a book per volume.** As before (ADR 0006), mangabind's `--batch` is called once for the library; the workflow then converts the titles it was asked for. Titles that failed stay in the row and run again on the next run. Titles that were saved are never run again, and the row leaves the queue once every title is saved. Each title is its own outcome in the results, so a book saved and one that failed are told apart.
- **A library is joined title by title first.** It can join only or join and convert; asked not to group at all, it is left out with the reason instead of being grouped anyway. A queue of libraries alone locks the grouping step with that reason visible.
- **No path crosses the IPC boundary for a library.** It is a session like any other input. Reading it again, saving a title's mapping and converting it name the session, and the titles by name. The main process finds the library's folder from the session and each title's folder from what it read, builds the mapping from the chapters it read, and takes from the renderer only which volume each chapter belongs to. The commands that took a folder path (`choose-input-batch`, `plan-batch`, `convert-batch`, and a title mapping by path) are gone.

## Consequences

A library is added, checked, fixed and run the same way as everything else in the queue, and the batch review, its state and the temporary button are removed.

Known limits: only a library one level deep is read (a folder of libraries is not); a folder inside a library that holds no chapters is ignored rather than listed; running one title of a library still joins the whole library first, as retrying one title always did, since `--batch` has no way to name titles; and the process, device and format apply to the whole queue, a library included.
