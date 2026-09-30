# ADR 0029: The books of one run never replace each other

- Status: Accepted
- Date: 2026-09-29
- Amends: [ADR 0007](0007-library-indexing-and-opds-delivery.md) (what happens when two books have the same file name)

## Context

Every run writes into one pending folder ([ADR 0026](0026-process-then-save-pending-books.md)), and both tools decide the file names themselves: mangabind names a volume `<folder> - Vol.NN.cbz`, and mangapress names a book after its title, which is the input's file name unless a title was given. ADR 0007 said a file published under an existing name replaces it, on the reasoning that the same input with the same settings always lands on the same path, so a reconversion refreshes its book. That holds for one input converted twice. It does not hold for two different inputs in the same run that happen to share a name.

Checked against the pinned tools, not assumed:

- Two different books converted with the same title, or two `Vol.01.cbz` from different folders converted into one output folder, both exit 0 and leave one file. The second one silently overwrote the first, and the catalog, which keeps one entry per path, forgot the first.
- In the app this happens for loose `.cbz` files called `Volume 1.cbz` from different series, for two folders with the same name in different places, in "join only" mode as well, and for any run where the global Title option is set with more than one book.
- mangapress only avoids overwriting the input it is reading (it adds ` (mangapress)`); it never checks the other files in the output folder.

## Decision

- **No book of a run replaces another.** The first keeps its name; a later one with the same name is published as `Name (2).ext`, then `Name (3).ext`, and so on. Names are compared without regard to capitals, so the folder can be copied to Windows, macOS or a FAT drive without two books that differ only in case.
- **The tool's own naming is left alone.** mangapress writes into a private folder inside the run's hidden `.mangabound/incoming` folder, one per book, and the app then moves the finished file into the run's folder under a free name. A name that does not clash is exactly the name the tool chose, so nothing changes for a run without duplicates. The private folder is always removed, including after a failure or a cancellation.
- **Joined volumes follow the same rule.** Saving a joined CBZ in "join only" mode used to replace a book of the same name; it now takes a free name.
- **Placement is one at a time.** The store hands out names in turn, so books finished at the same moment by the bounded worker pool ([ADR 0027](0027-bounded-volume-conversion.md)) can never receive the same one. Renaming retries briefly when another program (antivirus, an indexer) holds the file for a moment, the way the settings file already does.
- The book's name in the catalog and the path the results screen and the share panel use are the published ones.

ADR 0007's rule for the catalog itself is unchanged: publishing an entry whose relative path already has one still replaces it in place. Within a run that no longer happens; it is left for a person who explicitly overwrites a file with Save As.

## Consequences

A run can no longer lose a book to a name clash, whatever the titles are. Two books that clash keep the same title inside the file (only the file name gets the number); giving each book its own title is a separate change. A failure while moving a finished book is reported as a failed publication, and a cancellation stays a cancellation. The plan shown before a run lists the names the tools would choose, so it cannot show a number that is only decided when the book is placed.

Unit tests cover the naming rule, the store (clashes, capitals, simultaneous books, failure, cancellation, transient locks) and the workflow, and the packaged tests convert two folders of the same name with the real tools, both converting and joining.
