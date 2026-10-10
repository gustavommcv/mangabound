# ADR 0045: CBZ is the format a first launch starts with, and is listed first

- Status: Accepted
- Date: 2026-10-09
- Amends: [ADR 0011](0011-kcc-default-options.md) (the starting format was EPUB)

## Context

Mangabound started on EPUB because mangapress's own record ([its ADR 0008](https://github.com/gustavommcv/mangapress/blob/main/docs/adr/0008-mobi-azw3-permanently-out-of-scope.md)) says KOReader reads a fixed-layout EPUB well. Reading on a Kindle (2024) with KOReader 2026.07.2 showed otherwise, and what was found is written down here so the choice can be checked:

- **KOReader's own guidance is CBZ.** Its user guide says that EPUB text rendering can cause problems with full-page images and that CBZ is the recommended format for manga, and Kindle Comic Converter's FAQ says "CBZ for KOReader". The KOReader maintainers say the same in their issue tracker ([koreader#9163](https://github.com/koreader/koreader/issues/9163): EPUB is the wrong format for image-heavy content; [koreader#13109](https://github.com/koreader/koreader/issues/13109): for a slow CBZ, use pages of the screen's exact size in page mode).
- **KOReader lays an EPUB page out as reflowable text.** It ignores the fixed-layout viewport and keeps its own margins and status bar around the image, so a page is drawn smaller than the screen: 1002x1354 of a 1072x1448 screen with its default settings, and about 84% of the width for a page with the usual 2:3 shape (measured in KOReader's own engine; a change to mangapress's page markup, [pull request 46](https://github.com/gustavommcv/mangapress/pull/46), gets 12 px of that back, not the rest). A CBZ page has no margins and mangapress pads it to the device's screen, as Kindle Comic Converter does.
- **An EPUB has no way to fill the width.** KOReader has no fit-to-width zoom for an EPUB, and a view mode of "continuous" changes nothing for one. A CBZ has both.

What favours EPUB stays true: it carries a table of contents (one entry per chapter), an author, and the whole-series-in-one-book mode. Whether a CBZ turns pages slower on a Kindle is still being measured on the device; the reports found say it is a matter of the pages' size and the reader's settings, not of the format.

## Decision

- **The starting format is CBZ** (`defaultFormat`, `src/domain/preferences.ts`), for a first launch and for "Reset to defaults". A person who already chose a format keeps it: the choice is kept between sessions (ADR 0014) and nothing here rewrites it.
- **CBZ is listed first**, then EPUB, then PDF, in both places the format is chosen: the queue and the conversion options.
- **Single book mode is unchanged.** It still needs EPUB (ADR 0024): turning it on selects EPUB and locks the format, as before.
- **Not decided here:** MOBI/AZW3 for the Kindle's own reader. mangapress does not write them (its ADR 0008) and Kindle Comic Converter needs Amazon's kindlegen for them; whether they are worth adding is a separate question.

## Consequences

- A fresh start converts to a CBZ, with no chapter navigation and no author inside the file (the author stays in the catalog Mangabound shows). Choosing EPUB brings both back.
- A settings file that has no format at all (an old one) now reads as CBZ, where it read as EPUB.
- The docs say which format the app starts with and why, and the visual baselines that show the format selector are regenerated from Windows CI (CONTRIBUTING).
- If measuring CBZ on the Kindle gives a reason to prefer EPUB again, this record is where the change is made.
