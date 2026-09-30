# ADR 0031: Look up the author in a source the person chooses

- Status: Accepted
- Date: 2026-09-30
- Amends: [ADR 0013](0013-online-sources-for-volume-data.md) (what a source may be used for, and where it is offered)

## Context

The author of a book is typed by hand ([ADR 0030](0030-title-author-and-language-belong-to-each-book.md)). The online sources that already answer which volumes a work has know who wrote it too: MangaDex returns the authors with a search when asked (`includes[]=author`), in the same request and with nothing more sent, and the works a title matches are often several, with the same title and different authors.

[ADR 0013](0013-online-sources-for-volume-data.md) limited a source to two questions, and said that only titles and volume and chapter numbers are read from it. An author's name is neither, so using it needs that limit widened on purpose, not by accident.

Checked against the real service: `Chainsaw Man` finds the work with `Fujimoto Tatsuki`, its colored editions, and a doujinshi by another author; `Chainsaw Man - EN`, `chainsaw_man` and `Chainsaw.Man.v01` find nothing at all; and `Chainsaw Man Vol 1` finds unrelated works first. What a folder is called is often not what a work is called.

## Decision

- **What a source may be asked widens by one thing.** A search still sends only a title. A result may now also carry the names of the work's authors and the year it began (`authors`, `year`, both optional), which are read and shown, and used to fill the author. Nothing else is read, kept or downloaded, and a source that does not know an author is still a valid source.
- **Nothing is chosen for the person.** The rule of ADR 0013 stands: no source is chosen until a person chooses one, and only a search sends anything. The author is looked up from a button beside the Author field on the item's details page. It opens a panel with the list of sources, and the choice made there is the same one the volume editor uses and is kept the same way ([ADR 0014](0014-persisted-settings-and-reset.md)), so it is chosen once. There is no bulk search: each item is looked up on its own page, by a click.
- **The title is what is searched.** There is no search box of its own: the panel says, before anything is sent, "Will search MangaDex for “<title>”", following the title as it is edited, and the item's own name when no title was typed. To search for something else the title is what changes, which also gives the books the cleaner name.
- **Works are told apart, never picked for the person.** Each match shows its title, its authors and its year, and the person takes one with "Use author"; a match with no author listed offers nothing to take. The authors of a work are joined with a comma and the field stays editable.
- **A search that finds nothing says why it likely did.** It says what was searched, that extra characters in the title can keep a work from being found, and to try a simpler title above. It gives no example of such characters, since they differ from one name to the next. The volume editor's search, which has a search box of its own, says the same and to try simpler words. Nothing is cleaned, guessed or retried on the person's behalf, because every request must stay a click.
- **A source that does not answer is given up on.** Every request of every source now has a timeout of fifteen seconds, for the answer and its body both, reported as "did not answer in time, try again shortly" and told apart from a source that cannot be reached. A person who cancels (a new search, another source, leaving the screen) is still a cancellation, not a timeout. The catalogues answer in a second or two and someone is waiting on the screen, so waiting longer only hides that the source is not answering.
- **The source is credited where its data is used.** The panel says "Author data by <source>" with the link, and every text names the source by its own display name, never MangaDex by name, so a second source needs no change here.
- The search state (one search at a time, cancelled by a new one, a new source and leaving the screen) moves into one hook shared by the volume editor and this panel, so the two behave the same.

## Consequences

Telling apart the works a title matches costs nothing extra, and filling the author is one click after the search. A person who never opens the panel sends nothing. The volume editor's text still says only volume and chapter numbers are used, which stays true of that panel; the guide for adding a source and the README now say what this panel reads too.

Left as they were: the artist, who mangapress cannot store, is not read, and the author is kept only for the session; keeping it with a folder is a separate step. A slow connection that needs more than fifteen seconds gets the timeout message and can search again.

Unit tests cover the provider against a recorded real response (with authors, without one, with a null year, an author that came without attributes) and against the real empty answer. Component tests cover the panel, the notice, every failure, and the whole flow through the app to the command; stories cover the states. The request layer's tests cover the timeout, a body that stalls, a cancellation that must not read as a timeout, and a body that fails to arrive.
