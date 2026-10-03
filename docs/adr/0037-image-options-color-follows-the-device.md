# ADR 0037: Image options in two sections; color follows the device

- Status: Accepted
- Date: 2026-10-03
- Amends: [ADR 0011](0011-kcc-default-options.md) and [ADR 0036](0036-page-layout-options-are-grouped-by-decision.md) (a device change resets color as well as enlarging), [ADR 0005](0005-product-boundaries-and-anti-goals.md) (how the mangapress options are grouped)

## Context

The second step of [ADR 0035](0035-mangapress-0-7-first-its-options-in-steps.md) is images: color output, autocontrast for color pages, three variants of a PNG page, and no processing at all. They would join six controls in one "Image processing" section that mixed two questions, how a page's tones are corrected and what kind of file it is saved as. Disabling autocontrast was a checkbox there, and enabling it for color pages would have been a second one that the first cancels.

Read from Kindle Comic Converter 12.0.0's window: color output starts on for the six devices with a color screen (`KCS`, `KSCS`, `KoCC`, `KoLC`, `RmkPP`, `RmkPPMove`) and off for every other, and is set again each time the device changes, as enlarging is.

Checked against the pinned mangapress 0.7.2 by running it, not assumed:

- With `--noprocessing` every page of the book is the source file, byte for byte. The options that would change an image do nothing: spreads, size, borders, cropping, autocontrast, gamma, rainbow reduction and the page format. The reading order and the two-page view are still written into an EPUB, webtoon strips are still cut into pages, and the device still sizes the cover.
- An EPUB's cover is always a JPEG made from the first image, with or without `--noprocessing` and with or without `--forcepng`. It is in color with `--forcecolor` and is saved at `--jpeg-quality`. A CBZ or a PDF made by the app has no such cover.
- Among PNG pages, a page kept in color stays JPEG unless `--force-png-rgb` is given.
- `--pnglegacy` changes nothing when `--noquantize` is given or the book is a PDF: those pages are already stored with a whole byte per pixel.
- `--noautocontrast` wins over `--colorautocontrast`.

## Decision

- **Two sections in the place of "Image processing",** drawn as every other section is:
  - _Color and tone_: whether color is kept, autocontrast, black-point leveling, gamma and rainbow reduction.
  - _Page images_: the page format, the JPEG quality, and the three PNG variants.
- **Color follows the device, as enlarging does.** Choosing a device puts "Color pages" where Kindle Comic Converter starts it for that device: kept in color for the six color readers, converted to grayscale for any other, including a profile a later mangapress adds. A choice made by hand lasts until the device changes again, and the reset of "Color pages" goes back to what the current device starts with. These are now the two settings a device change touches.
- **Autocontrast is one list:** for black-and-white pages only (where it starts), off, or for color pages too. It replaces the "Disable auto contrast" checkbox and stands for mangapress's two flags, as [ADR 0036](0036-page-layout-options-are-grouped-by-decision.md) does for page size and borders.
- **The page format is one list,** JPEG or PNG, in the place of the "Dithered grayscale PNG" checkbox. The three PNG variants are checkboxes under it, locked until PNG is chosen.
- **"Use the images as they are" sits with the device,** in the first section, because it sets aside what the device and every section below it would do to an image. While it is on, each control that would change an image is locked and says so (`pageLayoutLocks`, `imageLocks`); the ones the book still takes are not: content, reading order, the two-page view.
- **A control is locked only when it does nothing.** "Color pages" and the JPEG quality still decide an EPUB's cover when the images are left as they are, so for an EPUB they stay open and say that only the cover follows them. The JPEG quality says what it applies to (every page, the color pages among PNG ones, or the cover alone) and is locked only when nothing is saved as JPEG.
- **Labels say what happens to the page:** "Keep all 256 grays", "8-bit PNG" and "Color pages as PNG too", not Kindle Comic Converter's "No quantize", "PNG legacy mode" and "Force PNG RGB".

## Consequences

Someone with a color reader gets color books by choosing the device, without finding an option first. Someone who chose grayscale by hand for a color reader has to choose it again after changing the device, as with enlarging.

A settings file written by an earlier release has no key for color, and is read with color off whatever its device: books keep coming out as they did, and "Color pages" shows as changed for a color reader until it is restored or the device is chosen again. The other new options are new keys that start off. Nothing else in `settings.json` changes shape; "Disable auto contrast" and "Dithered grayscale PNG" keep their keys and are now entries of a list.

The `deferred` group is down to five flags: `--smartcovercrop`, `--coverfill` and `--nokepub` for the third step, and `--spreads` and `--cover`, which stay.

Known limit: on the oldest Kindles (`K1`, `K2`, `K34`, `KDX`) a CBZ's PNG pages are already 8-bit, and "8-bit PNG" is left open there though it changes nothing; the rule depends on the profile and on whether a custom size is set, and is not worth repeating outside mangapress.

Unit tests cover the color default of every device, the device change, both lists in both directions, what is still saved as JPEG, every lock, the arguments, and reading a settings file written before these options existed; one test runs the pinned mangapress with every image option together and with the images left as they are. Component tests cover each section as a person uses it; stories cover a color reader with PNG pages and images left as they are.
