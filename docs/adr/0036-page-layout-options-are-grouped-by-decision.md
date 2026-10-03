# ADR 0036: Page-layout options are grouped by what a person decides

- Status: Accepted
- Date: 2026-10-03
- Amends: [ADR 0023](0023-individual-option-resets.md) (a control that stands for several flags has one reset), [ADR 0005](0005-product-boundaries-and-anti-goals.md) (how the mangapress options are grouped)

## Context

[ADR 0035](0035-mangapress-0-7-first-its-options-in-steps.md) offers mangapress 0.7's options in steps, and the first step is page layout: eight options that would join the twelve already in one "Page layout" section. Twenty controls in one grid are a list to read through, not choices to make, and several of them only mean something next to another: three options are about the whole copy of a double-page spread, which exists only for some choices of how spreads are handled.

Three of the existing controls already contradicted each other. "Upscale small pages", "Stretch to fit" and "Crop to fill" could all be checked, and mangapress lets one of them win (cropping over stretching, stretching over enlarging), so two of three checked boxes did nothing and the screen did not say which. A separate box for black borders beside the one for white would have added a second such pair.

Checked against the pinned mangapress, not assumed: in webtoon mode it never reads right to left, splits or rotates a page, uses any border but white, crops margins, autocontrasts or enlarges; it still crops between panels, stretches and crops to fill. Restacking strips replaces the handling of wide pages altogether. A whole spread that is kept upright is not rotated in either direction.

## Decision

- **Five sections, each one question,** in the place of "Page layout", drawn as the options screen already draws a section (a heading, a line under it, the same grid of fields, each with its own reset):
  - _Reading_: what the images are (pages, or webtoon strips) and which way they are read. It is marked basic and comes right after the device, because manga reading order is the option most people change.
  - _Double-page spreads_: what becomes of a page two pages wide, followed by what applies to the whole copy when one is kept, and by restacking strips.
  - _Size and borders_, _Cropping_ (unchanged), and _Two-page view_.
- **A choice with one answer is one control.** Page size is one list (fit, fit and enlarge, stretch, crop to fill) for mangapress's three flags, and borders are one list (automatic, white, black) for its two. Choosing an entry sets exactly the flags it stands for and clears the others, so a combination that only looked meaningful can no longer be made. Settings saved with such a combination are read as the entry that wins in mangapress, and are written back clean the next time that list changes.
- **Webtoon is a kind of content, not one more checkbox.** It is chosen where the reading order is, and it locks what webtoon strips never use.
- **A control without effect stays where it is, dimmed, and says why,** as [ADR 0005](0005-product-boundaries-and-anti-goals.md) already asks. It keeps its value: mangapress ignores it, and it applies again once the choice that locked it is undone. The rules for which control is locked, and the sentence each shows, are in the domain (`pageLayoutLocks`), not in the screen.
- **A device change still resets enlarging and nothing else** ([ADR 0011](0011-kcc-default-options.md)). It moves the page size between "fit" and "fit and enlarge"; stretching or cropping to fill were chosen by hand and stay.
- **A list has one reset** ([ADR 0023](0023-individual-option-resets.md)). Page size goes back to what the device starts with, borders to automatic.
- **Labels say what happens to the page.** "Keep the whole spread upright" and "Whole spread first", not Kindle Comic Converter's "No rotate" and "Rotate first". The existing "Double-page spreads" list is now "Wide pages", since its section has that name.
- **The two-page view says in its heading which readers use it** and that KOReader does not, and is offered for EPUB only: the three options are written into an EPUB and nowhere else.

## Consequences

Someone opening the options sees five short sections instead of one long one, and cannot tick three boxes of which one counts.

The names of three controls changed ("Upscale small pages", "Stretch to fit" and "Crop to fill" are now entries of "Page size"; "Force white borders" is an entry of "Borders"; "Double-page spreads" is "Wide pages"). The guide is updated in both languages. Nothing kept in `settings.json` changes shape: the new options are new keys that start off, and a file written by an earlier release is read with them off.

"Force white borders" used to be disabled for EPUB. It never should have been since mangapress 0.7, where the choice also sets an EPUB's page background, so borders are now offered for every format, with a description that says what the choice does in the chosen one.

Known limit: the options are still global. Reading direction and webtoon mode are facts about a series, and a queue with a manga and a webtoon needs two runs; [ADR 0030](0030-title-author-and-language-belong-to-each-book.md) left that for later, and so does this.

Unit tests cover the page size and border choices in both directions, every lock and its precedence, the arguments, and reading a settings file written before these options existed. Component tests cover each section as a person uses it; stories cover the webtoon state and the spread and border choices.
