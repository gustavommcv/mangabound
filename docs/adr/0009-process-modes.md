# ADR 0009: Process modes: join only, convert only, or both

- Status: Accepted
- Date: 2026-09-19
- Amends: [ADR 0005](0005-product-boundaries-and-anti-goals.md) (the interface exposes each process on its own), [ADR 0007](0007-library-indexing-and-opds-delivery.md) (who writes a book file)

## Context

The only process the app offered was join (mangabind), then convert (mangapress), in that order, for every input. Two things people asked for were missing: joining the volumes and stopping there, and sending a folder to mangapress without grouping it first.

Checked against the pinned binaries (ADR 0006 discipline):

- mangabind writes its volumes into whatever output directory it is given, overwrites a same-named `.cbz` without complaint, and leaves other files alone. It is not asked to write into a user's library: it only ever writes into a scratch workspace the app owns.
- mangapress, given a folder of chapters, makes one book named after the folder (`<folder>.<ext>`), reports the manga title and an author (`Unknown` by default), and its dry run returns the same fields a CBZ dry run does. A folder needs no mapping to be converted this way.

## Decision

- **Three fixed processes, chosen per run.** `bind-and-convert` (the existing default), `bind-only` and `convert-only`. A closed set, not a pipeline anyone assembles (ADR 0005). The interface shows them as two checkboxes, "Group chapters into volumes" (mangabind) and "Convert for e-reader" (mangapress); turning both off is not possible.
- **What each kind of input allows.** A folder allows all three. A CBZ is already one volume, so it only goes straight to mangapress. A library is bound by one `-batch` call (ADR 0006), so it can join or join-and-convert but never skip joining. A blocked step stays visible, disabled, with the reason (ADR 0005). A choice made for one input and carried over to another settles on the nearest process the new input allows.
- **`bind-only` publishes from scratch by copy.** mangabind still writes only into its scratch workspace. Each finished volume is then copied into `<library>/.mangabound/incoming` and renamed into the library, so a failed or cancelled run never leaves a half-written book, and a same-named book is replaced the way a reconversion replaces its book (ADR 0007). This amends ADR 0007: a book file is written by mangapress, or, when the run stops after joining, published from mangabind's output by an atomic copy. The book enters the catalog as a CBZ whose title is the file's name without its extension and whose author is `Unknown`.
- **`convert-only` on a folder needs no mapping and never runs mangabind**, so nothing is written into the source folder either.
- **The mangapress settings are irrelevant when mangapress does not run.** They are not validated in `bind-only`, the interface shows them locked with an explanation, and it sends defaults so a half-edited value cannot fail the request at the IPC boundary for a step that never happens.
- **The catalog follows books as they land.** Each book is reported when it is written, so a run that fails part-way still has its earlier books in the catalog, which was not true before.
- **A finished session is spent.** After a successful run its scratch workspace is released at once instead of when the user starts over: joining copies every volume, so keeping both around would double the disk use for the whole time the results are on screen. A failed or cancelled run keeps its session so a retry does not rescan.

## Consequences

Every process the two tools support is reachable from the interface, and the interface says what will and will not be run. Known limits, left as they were: warnings that mangabind raised while joining are still not shown on the results screen; a library chosen inside the input folder is not refused, so joined CBZ files written there would be seen as chapters by a later inspect; a rename that loses a race with a virus scanner on Windows fails the run with a readable message instead of retrying; a batch cannot skip joining; and the chosen process is not remembered between sessions, which waits for the settings decision.
