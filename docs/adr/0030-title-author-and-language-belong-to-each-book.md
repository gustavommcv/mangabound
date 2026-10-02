# ADR 0030: The title, author and language belong to each item, not to the options

- Status: Accepted
- Date: 2026-09-30
- Amends: [ADR 0011](0011-kcc-default-options.md) (the mangapress options that Mangabound shows), [ADR 0014](0014-persisted-settings-and-reset.md) (what is kept between sessions)

## Context

The conversion options had a Title and an Author. They lived in the same settings object as everything else, and that object is sent unchanged with every conversion of a run, so every book of every queue item received the same `--title` and `--author`. That was wrong on two counts:

- The author of one manga is not the author of the next, and a run with several items has several authors. A library of many titles could only ever be right for one.
- mangapress names the output file after the title, so a title shared by several books made them all write the same file ([ADR 0029](0029-books-of-one-run-never-replace-each-other.md) stops the overwriting, but every book would still carry one title).

[ADR 0014](0014-persisted-settings-and-reset.md) had already noticed that these two "name one book" and kept them out of the settings file; nothing made them belong to one book while a run was being made.

Checked against the pinned tools: the author is written into EPUB (`dc:creator`) and PDF, and not into CBZ, which carries no author or ComicInfo at all. mangabind has no notion of an author, and names each volume file `<folder> - Vol.NN`.

## Decision

- **Title, author and language are typed for an item.** Each queue item, and each title of a library, has an optional `BookDetails` (`title`, `author`, `language`). Anything left empty means the default: the title the tools derive from the input's name, no author, and the EPUB language chosen in the options. The details live with the item for the session; they are not kept between sessions and are not part of the options.
- **They leave the conversion options.** `MangapressSettings` no longer has a title or an author, and the options editor no longer shows them. The EPUB language stays there as the default a person sets once, because it is a preference that does not change from book to book; a book's own language overrides it.
- **A page of its own.** The item's row has a details button beside the volumes button, and each title of a library has the same two, opening one screen (`BookDetailsScreen`), like the volume editor does for volumes. The fields take effect as they are typed, there is no Save. The icons are `Layers` for volumes and `UserPen` for details; the details button is colored while something is set. A language that is not a language tag is refused where it is typed, so it can never make a run fail. When the folder names declare a language other than the one the book would be made in, and the format is EPUB (the only one that carries a language), the field offers a `Use <tag>` button beside it, so the language is taken with one click instead of typed; nothing is applied until it is clicked, and the declared language is still not used for the book on its own. A language is always written the way BCP 47 recommends (language in lowercase, a four-letter script in title case, a region in uppercase: `pt-br` becomes `pt-BR`), wherever it comes from: the details, the options, or a folder's `mangabind.json`. Tags do not tell capitals from small letters, so this is how the tag is written and not what it means; what is not a tag is left as it is. What the person typed stays in the field as it was typed (amended 2026-10-02).
- **What a title means depends on what the item makes.** For a series of volumes it is the series title, and each volume's book is titled `<Title> - Vol.NN`, in the shape mangabind gives its own files (two digits for a whole number, the number as it is for a fractional one), so the names stay unique and sorted. For a book that is not one volume of a series (a loose CBZ, a folder converted whole, a whole series made into one book) it is the book's title as it stands. The page says which it is and lists the titles the books will get.
- **The number of each volume comes from mangabind's report.** `BindingResult` and `BindingBatchResult` carry each volume's number with its path, where they only carried paths.
- **Only where mangapress makes the book.** Joining volumes without converting makes no book with a title, an author or a language, so the details are neither offered nor sent then.
- **The command carries them.** A conversion command has optional `details`, a library conversion has `titleDetails` (by the title's name), both validated by the same rules as the rest of the command. The mangapress adapter turns them into `--title`, `--author` and `--language` for each book, with the options' language when the book names none. A validated plan is stale as soon as details change.

Not decided here, and left for later: the reading direction (`manga-style`) is also a per-series matter, and stays a global option for now.

## Consequences

A run of several items or a library gets the right title and author for each, and no two books need to share a title. The options editor is shorter and only holds what a person sets once. The details of an item are lost when the item is removed or the app is closed; keeping the author and language with a folder is a separate step. The author is only searched for by hand at first; looking it up from an online source is a separate decision, because it changes what [ADR 0013](0013-online-sources-for-volume-data.md) says a source may be used for.

Unit tests cover the details rules, the queue reducer (including that a title's details survive the library being read again), the workflow (a title for each volume, for one book, for a library's titles, none when only joining), the adapter's arguments and the command contract. Component tests cover the screen and the whole flow from the row to the command, stories cover its states, and the packaged tests type a title, an author and a language for a folder and read them back out of the EPUB the real tools wrote.
