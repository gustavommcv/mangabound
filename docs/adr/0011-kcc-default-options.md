# ADR 0011: The mangapress options start where Kindle Comic Converter's window starts

- Status: Accepted
- Date: 2026-09-19
- Amends: [ADR 0005](0005-product-boundaries-and-anti-goals.md) (which values the mangapress settings start with)

## Context

mangapress re-implements Kindle Comic Converter's (KCC) conversion, and the interface exposes its whole flag surface (ADR 0005). The settings started at mangapress's own command-line defaults, which are KCC's _command-line_ defaults: manga order off, upscaling off, spreads split. KCC's _window_ opens with different ones, and people who know KCC expect the same start: right-to-left on, spreads split and rotated, upscaling on.

Read from KCC's source (`kindlecomicconverter/KCC_gui.py` and `KCC_ui.py` on its default branch, 2026-09-19), the window opens with:

- `default_options = {'gammaSlider': 0, 'croppingBox': 2, 'croppingPowerSlider': 100, 'rotateBox': 1, 'mangaBox': 2}`, where Qt's check states are 0 unchecked, 1 partially checked, 2 checked. That is: gamma on Auto, cropping "margins + page numbers" at power 1.0, spread splitter "split and rotate", right-to-left on.
- Stretch/Upscale set from the chosen device profile's `DefaultUpscale` every time the device changes, on for most current Kindles, Kobos and reMarkables and off for the oldest models, the Scribe family and the custom profile.
- Nothing else checked: no gamma, no black or white margin override, no force-PNG, no auto-level, no inter-panel crop, no rainbow reduction.

## Decision

- **The starting settings are KCC's window state.** `defaultMangapressSettings` now has manga reading order on, double-page spreads on "both", upscaling on, and cropping of margins and page numbers at power 1 (already so); everything else is off, automatic or left to the device profile. A unit test pins the list so it cannot drift by accident.
- **A device change resets upscaling to that device's default, as KCC's does.** The devices whose default is off are the ones KCC lists that way: `K1 K2 K34 K57 K810 KDX KPW KS KS1240 KS1324 KS1860 KS1920 KS3 KSCS KoA KoG KoGHD KoMT OTHER`. Any other profile, including one a later mangapress adds, starts with it on. It is the only setting a device change touches, and a value chosen by hand lasts until the device changes again.
- **Not changed here.** The starting device stays Kindle Voyage, mangapress's own default, where KCC opens on a Kindle Paperwhite; the starting format stays EPUB, where KCC starts on MOBI for Kindle profiles and EPUB for Kobo, and mangapress writes no MOBI.

## Consequences

A folder converted with nothing touched now comes out as it would from KCC's window. The one that will surprise anyone converting Western comics is manga reading order being on: it is KCC's start too, and the option is one checkbox in the mangapress options. The settings are still not kept between sessions, so each launch starts from these values again; keeping them waits for the settings decision. If KCC changes its window's start, this ADR is where the difference is recorded and the test is what needs updating.
