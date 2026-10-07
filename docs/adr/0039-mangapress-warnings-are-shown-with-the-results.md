# ADR 0039: What mangapress noticed is shown with the results, once per kind

- Status: Accepted (amended by 0042)
- Date: 2026-10-03

## Context

The fourth step of [ADR 0035](0035-mangapress-0-7-first-its-options-in-steps.md) is the warnings mangapress gives. The adapter read them and dropped them: only pages, stages, errors and the result were used, so a book made from pages smaller than the screen, or from pages already converted once, looked the same as any other.

Read from the pinned mangapress 0.7.2 and its protocol: a warning is an event with a stable `code`, a `message` and the `path` of the tool's input, and the run goes on. The codes it gives are `images_smaller_than_device`, `source_already_converted`, `skipped_non_images`, `spread_labels_ignored`, `spread_labels_skipped` and `output_collision`. The protocol asks consumers to choose by the code, never by the English text.

Two things about the text. The sentence for small pages was written for a terminal ("Consider --upscale (or --stretch)"), and names nothing a person sees in the app. And it carries its numbers ("12 of 40 pages") only inside the sentence, not as fields of the event.

For a volume the app bound, the tool's input is a scratch file mangabind wrote, so the path in the warning is one nobody chose.

## Decision

- **A book carries what mangapress noticed while making it,** as the code and the tool's own sentence. The path is not kept.
- **The results show the warnings below the books, one notice per kind,** each saying which books it is in: all of them, the one or two it names, or two and how many more. Twenty volumes with the same warning are one notice. A run that made a single book does not name it.
- **A notice is drawn as the results already draw an item that was skipped** (the amber box with the warning mark), in a list of its own, after any item that failed or was skipped. The heading still counts the books as ready: a warning is advice, not a failure.
- **A known code is said in the app's own words,** naming the option as the screen does ("Fit, enlarging small pages" under Page size). The texts and the grouping are in the domain (`warningNotices`).
- **A code the app does not know is shown in the tool's own words,** under "A note from mangapress", so a warning a later mangapress adds is not lost: its protocol lets a new code be added without a new version, and asks consumers to accept codes they do not know.
- **No number is shown for small pages.** Reading it out of the sentence is what the protocol forbids. It can be shown once mangapress reports it as fields, which the release the fifth step needs can add.

## Consequences

Someone who chose not to enlarge pages and got small ones is told why and where to change it, and someone converting pages a second time is told that it costs quality.

Known limits:

- A warning is shown with the results of the run that gave it. Books reopened later from "Ready books" are listed from what is on disk, without it.
- The dry run the app does for a loose CBZ or an ungrouped folder gives the same warnings before anything is converted, and they are not shown there. Bound volumes meet mangapress only during the conversion, so the results are the one place that covers every case.
- The options are not reachable from a notice; it names the option and the person goes there.

Unit tests cover the grouping and every sentence, the adapter keeping warnings (and not the path), and the pinned mangapress giving the warning for small pages and none once they are enlarged. Component tests cover the results with warnings; a story shows them.

## Amendment (2026-10-04): the notes of mangabind that mean something was left out

The same place shows what the joining step left out. [P2-01 of the audit](../audit-2026-10-04.md) found that two copies of a chapter in one folder make `mangabind` skip every copy, that the run said nothing, and that the last line read "2 books saved." The issues of the joining step reached the plan screen but were dropped after a run.

- Three of `mangabind`'s documented codes are carried to the books as warnings: `chapter_conflict` (copies of a chapter were all skipped), `chapter_gap` (chapter numbers are missing inside a volume) and `empty_chapter` (a chapter holds no pages). A fourth, `link_skipped`, is added by the [audit's P1-04](../audit-2026-10-04.md): `mangabind` does not follow a link that leads outside the folder, to a folder or to nothing (its ADR 0014), and says so for each, with the volume of the chapter it was in. They are the ones that say content of the person's is not in a book. The others (a chapter in no volume, a name no parser read) the person already saw while placing chapters, and an unknown code is not shown, since the app would have to title it.
- A note that names a volume goes to that volume's book; a note that names none, or a series bound as one book, goes to every book it could be about. The results group them by kind like the others, with the app's words.
- The editor refuses to place one of two copies of a chapter (`duplicate_chapter`): `mangabind.json` can only say "chapter 2", so every copy in the folder is found for it and all are skipped. A copy that the file name puts in another volume is not counted, since `mangabind` tells those apart. The message says to remove all but one from the folder, the one thing that fixes it.

## Amendment (2026-10-07): two more notes of mangabind

`mangabind` v0.7.0 leaves out a file that is not named like an image, and a `.cbz` page that declares it expands to far more than a page can be, with `unsupported_page_files` and `page_entries_too_large`. Both are carried to the books like the four above ([ADR 0042](0042-mangabind-0-7-pages-it-leaves-out-are-shown.md)).
