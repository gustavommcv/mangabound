# ADR 0032: Keep the author and language with the folder

- Status: Accepted
- Date: 2026-09-30
- Amends: [ADR 0030](0030-title-author-and-language-belong-to-each-book.md) (the details were lost when the app closed or the item left the queue)

## Context

The author and the language of a series are facts about it, not choices for one run, yet they were typed again every time the folder was added: for a library of many titles that is many pages, once per session. [ADR 0030](0030-title-author-and-language-belong-to-each-book.md) kept them for the session only and named this as the next step.

Where to put them was checked against mangabind's source and the pinned binary, not assumed:

- `mangabind.json` is the one file that lives next to a manga's chapters, that Mangabound already writes there (when a person saves a grouping), and that mangabind's scanner passes over silently. Any other file in a manga folder, a file of Mangabound's own for instance, is reported by mangabind as an unsupported file in every run.
- mangabind reads that file with a decoder that ignores keys it does not know, inside `manga` as well. Its `manga` block is documented as informational and never read by the matching logic. A folder whose file holds `manga.author` and `manga.language` and no volumes was read and joined normally by the packaged tools in the tests.
- Two writers already replace the whole file (saving a grouping in `bind` and `writeTitleMapping`), so anything kept in it has to survive them.

## Decision

- **What is kept.** The author and the language, under `manga` in the folder's `mangabind.json`, as `author` and `language`. The title is not kept: `manga.title` there already means the folder's name, and a title typed for a run is not a fact about the folder.
- **When it is written.** When the details page of a folder, or of a title of a library, is left and something a folder keeps changed since the page was opened. Not while typing, not when only the title changed, and not for a loose CBZ, which has no folder. A page that was only looked at writes nothing.
- **When it is read.** When a folder is read, and when a library is read or read again, each title's kept details come with it and fill its details. What was typed for a title in this session wins over what a re-read finds.
- **A file is only ever added to.** Writing the author and language changes those two keys and leaves the rest of the file as it was, including keys nothing here knows. A folder with no file gets a small one with the details and no volumes, since none were asked for. Clearing them takes the keys away, and the whole file with them if they were all it held; a file with a grouping, a source or anything unknown stays. A file that is not valid JSON, or not an object, is refused, never overwritten.
- **Saving a grouping keeps them.** `bind` and `writeTitleMapping` read the file they are about to replace and carry its author and language into what they write, so saving the volumes of a folder never forgets who wrote it. What mangabind itself is run with is still the grouping alone.
- **A failure never stops anyone.** If the folder cannot be written (read-only, a network folder, a file that is not valid), a notice says so and the details stay for the session. Reading never fails: a file that cannot be read or used holds no details.
- The bridge gets one call, `saveBookDetails` (the session, the title of a library's title when it is one, the details), validated by the same rules as the rest of a command; the folder is found from the session, never from a path the page names.

## Consequences

An author looked up or typed once is there the next time, for a folder and for each title of a library, and goes with the conversion. The cost is a write into the person's own folder, which happens only after a deliberate change on the page and only for the two keys, and says so when it cannot. A file the person edited by hand is rewritten with the same layout Mangabound already gives it when it saves a grouping. mangabind's own documentation does not list the two keys it ignores; adding them there is a documentation change for a later, separate pull request in that repository.

Unit tests cover the file rules (reading, carrying, adding, clearing, keeping the rest, refusing a broken file), the adapter (both existing writers keep the details, the new writer creates, changes and removes the file, and every failure), the workflow (reading for a folder and each title, saving for both, refusing a loose CBZ and unknown sessions) and the queue. Component tests cover saving on leaving the page only for a change, not for a title alone, the notice on failure and the titles of a library; a packaged test types an author and a language, checks the file next to the chapters, adds the folder again and finds them, joins the folder with the real mangabind, and clears them until the file is gone.
