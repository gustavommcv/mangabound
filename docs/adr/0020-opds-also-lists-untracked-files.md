# ADR 0020: OPDS also lists files the catalog does not know about

- Status: Accepted
- Date: 2026-09-22
- Amends: [ADR 0007](0007-library-indexing-and-opds-delivery.md) ("Feed shape": one navigation feed linking to exactly one acquisition feed)

## Context

Reported directly: a person converted a book in one session, moved or copied just the finished file into a different folder later, shared that folder, and it never showed up in KOReader. `library.json` (ADR 0007) is Mangabound's own bookkeeping, written only when a conversion finishes saving into that exact folder — the OPDS feed is built from it, not from a listing of the folder, so a file placed there any other way is invisible to it.

The person asked why the catalog file exists at all, and whether it is something OPDS itself needs. It is not: OPDS clients never read `library.json` — they only ever see the Atom feeds Mangabound generates from it. That makes it purely an internal choice, free to change. `library.json` still earns its place for what it alone can give the feed: the real title, author, and conversion time of a book Mangabound converted, which a bare file on disk cannot say about itself. The person's own framing, echoing ADR 0006 (mangabind and mangapress stay usable on their own; Mangabound only orchestrates), was to keep Share usable on its own too — even over a file nothing in this app ever touched.

## Decision

- **A second, separate acquisition feed for what is not tracked.** The root navigation feed now links to two: "Recently converted" (`/recent`, unchanged — exactly `library.json`'s entries) and "Other files" (`/other`, new — comic/book files sitting in the folder that are not in `library.json`, one level deep, not recursive into subfolders).
- **Weaker metadata for an untracked file, not a guess dressed up as fact.** Title is the file name without its extension, author is `"Unknown"`, and the feed's ordering uses the file's own modified time in place of a real conversion time. No attempt is made to open the file and read embedded metadata.
- **One download route for both.** `/books/<name>` now resolves either a tracked or an untracked entry. An untracked match can only ever be a bare file name a live directory listing just returned, so it can never resolve outside the shared folder.
- **`library.json` stays.** It remains the only source of accurate title, author, and conversion time, and the only place collision handling (ADR 0007) applies. This decision only adds a second, clearly-separated list beside it; it does not replace it or change what it records.

## Consequences

Sharing a folder now works whether or not anything in it was ever converted by Mangabound — dropping in a `.epub`, `.cbz`, or `.pdf` from anywhere is enough for it to show up, under "Other files," with plainer metadata than a book Mangabound itself produced. The two feeds add one more request-and-response shape to reason about and test, and a directory listing plus a `stat` per untracked file on every `/other` or `/books/` request — cheap for a personal library, not something this optimizes for at scale, consistent with ADR 0007's "no browsing, no search, no pagination" v1 scope.
