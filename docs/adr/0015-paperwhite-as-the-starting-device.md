# ADR 0015: The starting device is a Kindle Paperwhite, as in Kindle Comic Converter's window

- Status: Accepted
- Date: 2026-09-20
- Amends: [ADR 0011](0011-kcc-default-options.md) (which left the starting device alone)

## Context

ADR 0011 made the mangapress options start where Kindle Comic Converter's window starts, with one exception: the starting device stayed Kindle Voyage, mangapress's own default, where KCC opens on a Kindle Paperwhite. The person using the app asked for the Paperwhite, as KCC has it.

Read from KCC's source on 2026-09-20 (`kindlecomicconverter/KCC_gui.py`): the window starts on the fourth entry of its device list, "Kindle Paperwhite 12", whose profile label is `KPW6`. mangapress 0.5.0 lists that profile as `KPW6`, "Kindle Paperwhite 6", 1272 × 1696.

## Decision

- **The starting device is `KPW6`.** As for every device, upscaling starts on for it: KCC's table has it on for this profile, and ADR 0011's rule already gives every profile that is not in its list of exceptions the same. Nothing else about the starting options changes.
- **What was saved is not touched (ADR 0014).** A person whose settings were saved with another device, Kindle Voyage included, keeps it. Only a first launch, and a reset to the defaults, start on the Paperwhite.
- **If a later mangapress drops `KPW6`,** the app starts on the first device listed and says so, as it already does for any device that goes away.
- **Unchanged:** the format starts as EPUB. KCC starts on MOBI for Kindle profiles, and mangapress writes no MOBI.

## Consequences

The first book made after installing is sized for a current Paperwhite rather than an older Voyage. The interface, the reset and the saved settings behave as before.

Known limit: the name KCC shows ("Kindle Paperwhite 12") and the one mangapress reports ("Kindle Paperwhite 6") differ. The list shows mangapress's, which is what the pinned tool calls it.
