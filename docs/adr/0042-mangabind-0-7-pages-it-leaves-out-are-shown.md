# ADR 0042: Take mangabind 0.7.0; show the pages it leaves out, and stop a volume number where it does

- Status: Accepted (amended by 0043)
- Date: 2026-10-07

## Context

`mangabind` v0.7.0 is the release of the fixes from the October 2026 audit of the two tools (its ADRs 0015 to 0018, and the amendments to 0002, 0008 to 0011 and 0014). Its protocol is still version 1 and it adds no flag, so `capabilities:check` passes unchanged. What changes for this app, read from its protocol document and run against the pinned binary:

- **A page is an image, by its name** (its ADR 0016). `.DS_Store`, `Thumbs.db`, `desktop.ini`, `ComicInfo.xml`, `._` files and a `__MACOSX` folder are left out without a word; any other file that is not named like an image is left out with a warning, `unsupported_page_files`, one per chapter. `page_count` counts images only. Until now the files went into the volume, and mangapress skipped them with `skipped_non_images`; now mangapress never sees them, so **the app would have said nothing** about a page left out, which is the case the warning exists for (an `.xyz` image, or a page with no extension, is dropped).
- **An archive entry that declares it expands to far more than a page can be** is left out of a `.cbz` chapter, with `page_entries_too_large` (its ADR 0018).
- **A mapping file may not give a volume above 100000**, nor list more than 100,000 chapters (its ADR 0017). The mapping editor of this app took any whole number up to 2^53, so a volume typed as `500000` was accepted on screen and failed when the volumes were joined.
- **`metadata_duplicate_chapter`**, a warning for a file that lists a chapter under two volumes (its ADR 0010).

The rest of 0.7.0 needs nothing here, and was checked: volumes are written to a `.part` file and renamed, but the app takes its volumes from the report, never from a listing of the folder; the default output folder is not used (the app always gives `--output`); a failed volume no longer stops the others, and the run still ends with exit 1 and an error, which `assertSuccessful` already turns into the error of the run; installers verify a checksum, and the app does not use them.

## Decision

- **The pin is `mangabind` v0.7.0** (`npm run toolchain:update`, then `toolchain:acquire`). A test that runs the pinned tool on a chapter with an image, a `.DS_Store` and a text file expects two pages and one `unsupported_page_files` note, so a pin to an earlier release fails it.
- **`unsupported_page_files` and `page_entries_too_large` are carried to the books** like the notes of [ADR 0039's amendment](0039-mangapress-warnings-are-shown-with-the-results.md): the note that names a volume goes to that volume's book, with the app's words. They say content of the person's is not in a book, which is what that set is for.
- **`metadata_duplicate_chapter` is not shown.** The file it is about is the one the app writes from the editor, where a chapter is in one volume or none, so the app cannot make it; and the person has already placed the chapters.
- **A volume number the editor takes is from 0 to 100000**, `mangabind`'s own limit, with the same whole-or-decimal form as before. The number is refused where it is typed, with the other refusals, not after the volumes are joined.
- **The guide of the site lists the notes of `mangabind`** (the four of 0039's amendment and these two), in both languages. It listed only those of mangapress.

## Consequences

A folder with a credits file or an image with an unusual extension now says so on the results, where before the credits file was skipped by mangapress with a warning and the unusual image was in the volume without notice.

Page counts shown while placing the chapters are the number of images, so they are lower than before for a folder with other files; nothing in the app counted pages itself.

Looked at and left as it is:

- **Cancelling** a run kills `mangabind`, which now stops on SIGTERM with exit 130, removes its unfinished `.part` file and reports `interrupted`. The app's runner rejects with its own cancellation at the moment of the abort, before the exit is read, so that report is not seen; and the files are in the run's scratch folder, which the app removes. Nothing to change.
- **A link in a library folder** (a series kept as a link to a folder) is skipped, and now said so by `mangabind` as an issue of the whole run. The app carries it in the plan of the library and in the result of the run, and shows it nowhere: it belongs to no book, and showing it is a screen of its own. It is the follow-up this record leaves open.

## Amendment (2026-10-07): the library's links

The follow-up this record left open is [ADR 0043](0043-a-series-kept-as-a-link-is-said-to-be-missing.md): the library's screen and the queue row say which series are links that were not read.
