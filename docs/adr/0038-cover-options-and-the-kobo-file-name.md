# ADR 0038: The cover has a section of its own; a Kobo's file name sits with the device

- Status: Accepted
- Date: 2026-10-03
- Amends: [ADR 0005](0005-product-boundaries-and-anti-goals.md) (how the mangapress options are grouped)

## Context

The third step of [ADR 0035](0035-mangapress-0-7-first-its-options-in-steps.md) is the cover (cut from a wide image, cropped to fill) and a plain `.epub` name for a Kobo. Since the pin moved to mangapress 0.7.2 a Kobo's EPUB has been named `.kepub.epub` with nothing on the screen to choose otherwise.

Checked against the pinned mangapress 0.7.2 by running it, for a 1272x1696 screen:

- The cover is made from the book's first image, apart from the pages. A first image of 1600x1200 gives a cover of 1272x954, the whole image shrunk to fit; an 800x1000 one stays 800x1000, since a cover is never enlarged.
- `--smartcovercrop` cuts the front out of an image wider than it is tall (1024x1200 from the first), on the side the reading order puts it, and leaves any other image alone.
- `--coverfill` crops the cover, enlarging a small one, to the screen exactly (1272x1696 from both).
- An EPUB always has this cover. A CBZ gets it, as its first image, only when `--smartcovercrop` cut one; `--coverfill` alone changes nothing in a CBZ. A PDF has none.
- Both options still apply with `--noprocessing`.
- With a Kobo profile an EPUB is named `.kepub.epub`, and `.epub` with `--nokepub`; the two files differ in nothing but the modification time written in them. With a custom width or height the name is already `.epub`.

## Decision

- **A "Cover" section, after "Page images",** drawn as every other section is, with two checkboxes: "Cut the front cover from a wide image" and "Crop the cover to fill the screen". They are two checkboxes and not a list because both can be on at once.
- **"Name the book .epub" sits with the device,** in the first section beside "Use the images as they are": it depends on the device and the format, which are chosen there, and it is about the file, not about what is in the book.
- **A control is locked only when it does nothing,** and says why (`coverAndNameLocks`), as [ADR 0036](0036-page-layout-options-are-grouped-by-decision.md) and [ADR 0037](0037-image-options-color-follows-the-device.md) do:
  - both cover options for a PDF; cropping to fill for a CBZ until the front is cut from a wide image;
  - the plain name for anything but a Kobo's EPUB, and for a Kobo with a custom size.
  - Images left as they are lock neither cover option, since the cover is made apart from the pages.
- **Whether the device is a Kobo is what mangapress says,** the `family` it reports for each profile, not something the app works out from a profile's code ([ADR 0006](0006-cli-first-tool-boundary.md)). Until the profiles have loaded the name is not offered.
- **Every one of the three starts off** ([ADR 0011](0011-kcc-default-options.md)): the cover is the whole first image, fitted, and a Kobo's EPUB is named `.kepub.epub`, as in Kindle Comic Converter.
- **Labels say what happens,** not the names of the flags (`--smartcovercrop`, `--coverfill`, `--nokepub`).

## Consequences

Someone whose volumes start with a jacket scan gets its front as the cover, and someone whose reader shows covers full screen gets one without bars, at the price of its edges. Someone with a Kobo can choose the name again.

The `deferred` group now holds `--spreads` and `--cover` and nothing else, which is where [ADR 0035](0035-mangapress-0-7-first-its-options-in-steps.md) said it would end. The two steps left add no option of this kind: the fourth shows mangapress's warnings, and the fifth, a cover of the person's own for each volume, waits for a mangapress that takes a covers folder. Both cover options here will apply to such a cover too, since mangapress prepares it as it prepares any cover.

The three options are new keys that start off, and a settings file written by an earlier release is read with them off.

Known limit: "Cut the front cover from a wide image" does nothing for a first image that is not wider than tall, and the app does not know what the first image is, so the option stays open and says when it applies.

Unit tests cover every lock, the arguments, and reading a settings file written before these options existed; the test that runs the pinned mangapress for a Kobo also makes the same book under the plain name with both cover options. Component tests cover the two controls of the cover and the name as a person uses them; a story covers a Kobo with all three on.
