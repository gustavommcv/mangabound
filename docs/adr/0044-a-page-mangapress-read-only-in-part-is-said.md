# ADR 0044: A page that mangapress read only in part is said

- Status: Accepted
- Date: 2026-10-09

## Context

Until mangapress 0.7.3, a page whose file was cut short (an interrupted download is the usual cause) stopped the run: the conversion failed on that page. The next release of mangapress follows Kindle Comic Converter there ([its ADR 0020](https://github.com/gustavommcv/mangapress/blob/main/docs/adr/0020-follow-kcc-on-the-differences-left-open.md)): a PNG or GIF that ends early is read as far as it goes, the rest of the page is blank, and **the book is made**, with a warning, `page_truncated`, at the `process` stage. The warning carries `chapter` and `page` (the position in the chapter) and the file's path.

A book that is made when it used to fail is a change for this app: the person no longer sees an error for that page, so the warning is the only place the app can say that a page is not whole. [ADR 0039](0039-mangapress-warnings-are-shown-with-the-results.md) shows what mangapress noticed with the results, in the app's own words for a code it knows, and in the tool's own sentence under "A note from mangapress" for a code it does not. The tool's sentence names the chapter and the file as the tool saw them; for a volume the app bound, the file is an entry of a scratch `.cbz` and the chapter a folder mangabind named.

## Decision

- **`page_truncated` is a known code,** with the app's own words: the file of a page ends before its image does, usually because a download stopped; the book keeps what could be read and the rest of that page is blank; download the chapter again to get the whole page. It is one notice for the run, grouped with the books it is in like the others of 0039.
- **The pin does not move.** The pinned mangapress (0.7.3) never gives this warning, so the words wait for the release that does, and nothing about the app's behavior changes until the pin is moved with it. Adding the words first means that moving the pin does not bring a book with a blank part that the app calls "a note from mangapress".
- **Nothing of the warning is kept but its code and sentence,** as 0039 decided: not the page, not the file. The notice does not say which page, because the page and file names are the scratch ones for a bound volume, and the person can do nothing with them; the advice (download again) is about the chapter.
- **The guide of the site lists it,** in both languages, with the others of mangapress.

## Consequences

When the release that gives the warning is pinned, a book made from a page that was cut short says so below the books, and the person is told to download the chapter again. Until then nothing is shown, because nothing is given.

Known limits: the notice does not name the page or the chapter. If a person has many pages cut short, they are told once, not once for each. Both could be changed by carrying the event's `chapter` and `page` fields, which 0039 chose not to do for a first version of warnings.

A unit test checks the words, like the other known codes; no pinned-tool test can: the pinned tool does not give the warning.
