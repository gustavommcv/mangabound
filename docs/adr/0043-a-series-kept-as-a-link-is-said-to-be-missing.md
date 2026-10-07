# ADR 0043: A series kept in a library as a link is said to be missing

- Status: Accepted
- Date: 2026-10-07

## Context

Someone who keeps a library as links into a download folder has a folder of links to series. `mangabind` has never followed such a link: a manga folder of a library is read only if it is a real folder, since following a link would put whatever folder it points to into a volume (its ADR 0014). Before v0.7.0 it skipped the link without a word. [ADR 0042](0042-mangabind-0-7-pages-it-leaves-out-are-shown.md) took v0.7.0, which says so as `link_skipped`, an issue of the whole run with the link's own path, since a link is not a manga and there is none to attach it to. The app carried that issue in the plan of the library and showed it nowhere, and 0042 left it open.

What the person saw, run against the pinned binary on a library of one real series and one link:

- The library opened with one title, and nothing said a second series had been left out.
- A folder whose series were all links was not a library at all: no title had a chapter, so the app kept it as one folder with no chapters, and the row said "mangabind found no chapters here. Turn off 'Group chapters into volumes'". Turning grouping off does not change what is in the folder, so the one thing the row advised was the wrong one.

The notes the results show at the end of a run ([ADR 0039](0039-mangapress-warnings-are-shown-with-the-results.md)) are made from the books, and a link that was skipped never became one. They are not the place.

## Decision

- **The names of the links come from the issues of the library read**: a `link_skipped` with a path and no manga (`skippedLinkNames`). A link inside a manga has a volume and a chapter, and is shown with its book as 0039's amendment says.
- **The library's screen says so above the list of titles**, in the amber box the screen already uses for the single-book mode: how many folders were not read, that they are links and that `mangabind` does not follow links to a series, what to do (put the real folder in the library, or add it on its own) and the first three names, with how many more. Singular and plural are both written.
- **A folder in which every series is a link says so on its row in the queue**, in place of the advice about grouping: how many folders in it are links, that they were not read, and to put the real folders in the library and add it again. The row is still "Not recognized" and still not run. Such a folder is not read as a library, so the screen of titles does not exist for it, which is why the queue row is the second place.
- **The names are kept with the row**, as the folders `mangabind` could not read as chapters are (ADR 0030's neighbour, the `unrecognized` list): the read of the folder returns them (`skippedLinks`), the queue stores them, and they are not asked for again when a title's mapping is saved and the library is read again.
- The helpers that cut a name out of a path and spell out "A, B, C and 2 more" were in the note about unrecognised folders and are now shared (`folder-names.ts`).

## Consequences

A library of links is no longer silent: the person sees which series are missing, by name, before converting anything, and what makes them reappear. The advice that fits is the only one given.

Known limits:

- Only the first three names are spelled out. The rest are counted.
- A link that leads nowhere is reported by `mangabind` like one that leads to a folder, and the note says "a link", which covers both.
- The person is told, not helped: the app does not follow the link for them. Following it is what the tool refuses on purpose, and a flag that allowed it would put a file of the person's into a book of someone else's folder (ADR 0014 of `mangabind`).

Unit tests cover the names, the three texts, the reading of a folder (a library with links, a folder of only links, a folder with none, an empty one, and one that cannot be read as a library) and the row. Component tests cover the screen with and without the box and the row. A test runs the pinned `mangabind` on a library with a link beside a real series and on a folder of only links. Stories and two visual baselines show both; the narrowest window is checked for sideways scrolling.
