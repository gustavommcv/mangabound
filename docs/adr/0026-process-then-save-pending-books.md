# ADR 0026: Process first, then save pending books

- Status: Accepted
- Date: 2026-09-28
- Amends: [ADR 0007](0007-library-indexing-and-opds-delivery.md), [ADR 0010](0010-input-queue.md), [ADR 0014](0014-persisted-settings-and-reset.md), [ADR 0016](0016-one-share-panel-fixed-title-bar-clickable-drop-area.md)

## Context

Requiring an output library on the queue screen makes the common one-book flow need an unrelated folder decision before processing. The natural choice often happens only after the finished book is visible. OS temporary directories are unsuitable for this intermediate result: the OS may remove them, and an unsaved converted book must survive closing and reopening the app. Electron's roaming `userData` directory is also an unsuitable place for large books on Windows.

## Decision

- The queue has no output-folder control. A ready queue item can be processed immediately. Validation does not create a run or write a book.
- Main creates a separate pending directory for each processing run under app-managed **local persistent data**: `%LOCALAPPDATA%/Mangabound/Pending` on Windows (moved, see the amendment below), `~/Library/Application Support/Mangabound/Pending` on macOS, and `$XDG_DATA_HOME/mangabound/pending` (or `~/.local/share/mangabound/pending`) on Linux. The environment override for packaged test isolation must be an absolute path. These are not OS temporary directories. The renderer receives only an opaque run id.
- The existing conversion workflows and per-folder library catalog write to that run directory. The results screen calls the books **ready**, offers native **Save as…** for each book, **Save all to folder…** for a multi-book run, and the existing Share panel. Save All remains available after an export so choosing the wrong folder does not require reprocessing. Sharing can serve the pending run before any export. Books not yet saved can be reopened from the queue after a window reload or app restart.
- An export copies the complete pending file to a staged file in the chosen destination directory, then publishes it under the requested name. Save All never silently replaces an existing file; a colliding name gets a numeric suffix, including on a repeated export. It uses an exclusive hard link for atomic publication where supported, and an exclusive copy on FAT/exFAT or another filesystem without hard links; that fallback is not atomic, but the pending original remains untouched and a failed copy is reported. Save As follows the native dialog's explicit overwrite choice. Each exported file is indexed in the destination folder's `.mangabound/library.json` before it is marked saved in a small atomic per-run record. A catalog or record warning keeps the pending source recoverable for a retry. Individual failures in Save All are reported per book; other pending books remain available.
- The pending source is retained while the app is open, so an active OPDS share is not broken by saving. After sharing stops at quit, a run is removed only if **every** book in it was saved. An unsaved or partly saved run survives. Interrupted runs can be recovered from their catalog, with root-level unindexed outputs as a fallback.
- The old `settings.json` `outputFolder` value is retained only as the suggested location for the next native Save dialog and updated after a successful save. It never becomes an automatic conversion destination. A missing legacy folder is ignored rather than blocking processing. Options and network-interface preferences retain their existing behavior.

## Consequences

The usual flow has fewer decisions up front, while exporting remains explicit. Pending books occupy local disk until exported and the app closes; users must be able to see and return to them. Destination indexing remains per folder, preserving the OPDS behavior from ADR 0007. The new storage adapter and path selection are unit-tested under the project's 100% coverage gate; packaged tests cover real folder/CBZ processing, saving, sharing before saving, and window-level recovery. The packaged test controller cannot reliably reattach native-dialog mocks after a full process restart, so restart durability is additionally tested by constructing a fresh storage adapter against the same on-disk run.

## Amendment (2026-10-04): not in the installer's folder on Windows

[P3-02 of the audit](../audit-2026-10-04.md) found that the Windows folder named above, `%LOCALAPPDATA%\Mangabound\Pending`, is inside the folder the installer puts the app in: Squirrel installs to `%LOCALAPPDATA%\mangabound` (the name comes from `package.json`) and Windows takes the two spellings for one folder. An install of the app showed `Pending` beside `Update.exe`. Squirrel's uninstall removes the folder it installed to, which would take with it the books a person had converted and not yet saved, the very thing this ADR keeps out of places the system may clear. Updating by installing the next version keeps the folder; uninstalling does not.

- On Windows the app's own folders are now in `%LOCALAPPDATA%\Mangabound Data` (`Pending` and `Covers`), which no installer owns. macOS and Linux are unchanged.
- At start, before anything reads them, `Pending` and `Covers` in the old place are moved to the new one (`src/adapters/library/legacy-storage.ts`): whole when the new place has no such folder, entry by entry when it has, never replacing an entry that is already there. The rest of the old folder, the installer's files, is not touched. A folder that cannot be moved is reported in the log and left where it is; the app starts either way. A root chosen by the environment (packaged tests) never had anything in the old place, and is not moved.
- Not reproduced: the uninstall itself was not run, because the machine used for the check has a real install with real data. The layout above was seen; the removal is Squirrel's documented behavior for the folder it installed to.
