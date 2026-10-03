# ADR 0035: mangapress 0.7 is taken first, and its new options are offered in steps

- Status: Accepted
- Date: 2026-10-03
- Amends: [ADR 0005](0005-product-boundaries-and-anti-goals.md) (for a while, the interface does not expose the tool's whole flag surface)

## Context

mangapress 0.7 was made so that its pages are the ones Kindle Comic Converter 12.0.0 makes, and is checked against KCC itself. It started from a fault seen in a book this app made: in KOReader the pages came out 11 to 15% wider than they were drawn, because of how mangapress wrote each page of an EPUB. That is fixed in 0.7, with a number of smaller differences from KCC nobody had chosen.

The same release adds nineteen options the app knows nothing about, most of them the rest of what KCC's window offers. [ADR 0005](0005-product-boundaries-and-anti-goals.md) says the interface exposes the whole flag surface of both tools, and `npm run capabilities:check` fails when a tool has a flag the app does not represent. Taken as written, that makes the fix wait for nineteen controls, their rules, their tests and two languages of the guide, in one pull request nobody could review ([CONTRIBUTING](../../CONTRIBUTING.md#pull-requests)).

Checked against the released tool, called the way the app calls it, before deciding anything:

- With a Kobo profile, an EPUB is now named `.kepub.epub`, as KCC names it. 0.7.0 and 0.7.1 also reported `kepub.epub` as the _format_ of the book, which the app's protocol parser refuses; every conversion for a Kobo would have failed. That was fixed in mangapress (0.7.2), which is why 0.7.2 is the release pinned here.
- mangapress now looks beside its input for a `Covers` folder and for spread labels (`<input>.json`). The volumes it converts for the app are files mangabind wrote in a scratch workspace, so neither is ever found there. They are found when the input goes to mangapress as it is: a loose CBZ, or a folder with "Group chapters into volumes" off.
- It warns when most pages are smaller than the screen and nothing enlarges them, and when the pages were already converted once. The app shows no warning from mangapress today, only errors.
- The complete argument list the app can send is accepted unchanged, and the event stream is still protocol 1.

## Decision

- **The pin moves to mangapress 0.7.2 now, on its own,** with only what the new release requires of the app: a name ending in `.kepub.epub` stays whole when a book is given a free name ([ADR 0029](0029-books-of-one-run-never-replace-each-other.md)), so `Name (2).kepub.epub`, not `Name.kepub (2).epub`.
- **A flag can be deferred, in writing.** `schemas/cli-capabilities.json` gets a fourth group, `deferred`: flags the pinned tool has and the app does not offer yet. The check still fails for a flag that is in no group, refuses one listed as both offered and deferred, and prints the deferred ones on every run, so the list cannot be forgotten. A deferred flag is never sent.
- **The deferred options arrive in steps, one pull request each,** every one with its rules in the domain, its tests, its stories and both languages of the guide:
  1. Page layout: no rotation of a whole spread, the rotated copy first, 1x4 strips as 2x2, black borders, webtoon mode, and the three that place pages in a two-page view (spread shift, one page in landscape, inverted page turn).
  2. Images: color output, autocontrast for color pages, the PNG variants (8-bit, not quantized, color), and no processing at all.
  3. The cover (cut from a wide image, cropped to fill) and a plain `.epub` name for a Kobo.
  4. The warnings mangapress gives, shown with the results.
  5. A cover of the person's own for each volume, from a folder of covers chosen on the item's details page ([ADR 0030](0030-title-author-and-language-belong-to-each-book.md)), with a list of which image each volume gets before anything runs. This one waits for mangapress: the tool has to accept a covers folder that is not beside its input and say which cover it would use, so that the app shows the tool's own answer instead of working one out ([ADR 0006](0006-cli-first-tool-boundary.md)).
- **Where KCC's window has one control with three states, so does the app.** Borders are automatic, white or black; autocontrast is for black-and-white pages only, off, or for color pages too. Two checkboxes that can contradict each other are not offered.
- **Every new option starts off,** which is where KCC's window starts them ([ADR 0011](0011-kcc-default-options.md)). A Kobo's EPUB is named `.kepub.epub` unless the person turns that off, as in KCC.
- **An option that does nothing in KOReader is still offered, and says so.** The three that place pages in a two-page view are written into the EPUB for the readers that use them (Kobo's and Kindle's own); KOReader's engine does not read them, which was checked by rendering the same book with and without each.
- **Two flags stay deferred after the last step, on purpose:**
  - `--spreads`, which joins pages labelled as the two halves of a spread. Labelling them means showing pages side by side, and a page preview is an anti-goal ([ADR 0005](0005-product-boundaries-and-anti-goals.md)). mangapress still honors a label file that sits beside a loose CBZ.
  - `--cover`, one image for one book. The app makes several books of one item, so it offers the covers folder of step 5 instead.

## Consequences

Someone who updates gets the fix at once: pages are no longer stretched in KOReader, and books match KCC 12's. Nothing in the interface changes in this step.

Three things do change without a control to show for it yet. A Kobo's EPUB is named `.kepub.epub` and stays that way until step 3 offers the choice. A loose CBZ, or a folder converted without grouping, takes its cover from a `Covers` folder beside it if there is one, and joins the pages a label file beside it names. And mangapress's warnings exist but are not shown until step 4.

For as long as the `deferred` group is not down to the two flags above, ADR 0005's "entire supported flag surface" is not true, and this record is where that is admitted. When step 5 lands, the group holds `--spreads` and `--cover` and nothing else; a later mangapress flag is offered or deferred here in the same way, with a reason.

Unit tests cover the name of a Kobo book that needs a free name, a Kobo conversion as the adapter receives it, and that the format 0.7.0 and 0.7.1 reported is refused. The capability check was run against the pinned binary.
