# Tutorial media

Images illustrate the interaction; the written instructions remain sufficient without them. Mangabound captures are generated from the guide's source commit. KOReader stills are maintained manually. See [ADR 0034](../docs/adr/0034-tutorial-images-from-the-site-source-commit.md).

## Automatic Mangabound captures

From the repository root, run `npm run site:media`. Playwright serves the static Storybook build on localhost, verifies the required UI states and interactions, and captures the relevant screen or region. The same scenario runs in ordinary browser contexts with different `deviceScaleFactor` values and an unchanged CSS viewport. A 1× pass discovers the region sizes, then only the densities needed for the guide's 720 CSS-pixel column at 1×, 2×, 3× and 4× are rendered. The full-size original is at least 2880 pixels wide and retains at least the previous 3× capture density. No existing bitmap is enlarged or reduced. Each capture verifies its decoded pixel dimensions against the region's size and records every variant's filename, dimensions and pixel ratio in the manifest. It waits for fonts and removes incidental focus/caret/animation; it never edits labels into images or approves visual baselines. Capture behavior lives in [screenshots.spec.ts](../tests/tutorial/screenshots.spec.ts).

The original keeps its `<name>.png` filename; lower-density alternatives use `<name>@<density>x.png`. The website uses only the files listed in the current manifest, not any old files remaining from earlier local generation. Both locales and repeated walkthrough instances share the same variants. The browser chooses a native alternative using `srcset` and `sizes="auto, …"`: lazy-image auto sizing uses the actual CSS layout, with a conventional fallback for older browsers. See [MDN's auto sizing guidance](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img#sizes). Increasing a monitor's pixel dimensions alone does not enlarge the guide column; display scaling and browser zoom determine its required pixel density. Beyond 4×, the full-size link remains available, but there is no promise of unlimited zoom detail.

Native variants deliberately avoid downsampling text screenshots: experiments found that resampling antialiased letters could make a smaller lossless WebP heavier than its native original. Keep lossless encoding and measure the files actually selected by browsers; a lower pixel count alone is not evidence of a smaller download. The browser suite covers mobile/desktop densities from 1× to 4×, sufficient selected resolution, lighter aggregate transfers at lower densities, and decoded-pixel equality against independent PNG inputs. Both development and production tests follow full-size links as document navigations, not just image requests.

Documentation CI generates these images for every PR and `main` update, then passes the same run's `tutorial-images` artifact to both site verification jobs and production. The artifact's `capture.json` records the source commit and story IDs. Publication occurs only from `main`; no generated-image commit, bot, or release tag is needed.

Generated PNGs live in ignored `src/assets/tutorial/generated/`. Both locales share them. Root `site:dev`, `site:build`, and `site:check` prepare them automatically. Rerun generation after UI changes during a dev session. The guide follows `main`, so images may show changes not yet in the latest downloadable release.

| Capture                     | State illustrated                                  | Guide                            |
| --------------------------- | -------------------------------------------------- | -------------------------------- |
| `queue-inputs.png`          | Chapter folder, manga library, and complete CBZ    | Quick start; adding manga        |
| `manual-mapping-start.png`  | Offline editor before creating the first volume    | Chapter mapping, expandable step |
| `manual-mapping.png`        | Two selected chapters assigned to a created volume | Chapter mapping                  |
| `online-mapping-search.png` | Search results from the selected source            | Chapter mapping, expandable step |
| `online-mapping.png`        | Proposed volume mapping before confirmation        | Chapter mapping                  |
| `device-settings.png`       | Device profile with custom width and height        | Conversion settings              |
| `single-book.png`           | Single-book mode and locked steps/format           | Conversion settings              |
| `processing-details.png`    | Completed, converting, and saving volumes          | Processing                       |
| `save-results.png`          | Individual save, repeatable Save All, and sharing  | Quick start; saving              |
| `ready-books.png`           | Reopen and delete a pending run                    | Saving and ready books           |
| `share-setup.png`           | Library, interface, and optional credentials       | Local sharing, expandable step   |
| `share-panel.png`           | Active server with an example catalog address      | Local sharing                    |

These are existing application components with deterministic Storybook sample data, not screenshots of live filesystem operations. Manga titles illustrate filenames; no manga pages are included. The LAN address is synthetic. The normal application unit/component/story/accessibility/visual/e2e gates remain independent.

## Manual KOReader captures

The project maintainer supplied and authorized cropping/publication of these screenshots on 2026-10-02, identifying **Kindle 2024 / KOReader 2026.07.2-198**. UI text is in English and existing red outlines identify the controls. The reading-settings captures do not identify the open book's format; do not claim that they verify EPUB- or CBZ-specific reading behavior. The OPDS download example shows an EPUB acquisition button, not a reading-format comparison.

Original files remain untouched outside Git. Only conventional lossless PNG crops are committed: no generative processing, no redrawing, no rewritten labels. Retained decoded pixels were checked against the original crop. Manga artwork below the menus and the editor's personal-path header are excluded; the download crop excludes the reader's directory and filename. On 2026-10-02 the maintainer explicitly requested retaining the complete OPDS form, including its local example address, rather than the previous credentials-only excerpt. That address is a screenshot of one setup, not a reusable endpoint; both locales explicitly tell readers to enter the address shown by their own app. No username or password is filled in. The remaining example directory in the Lua editor is part of the tutorial and is explained as an example, not a required Mangabound location.

Sources below are relative to the supplied screenshot folder. Coordinates and dimensions are pixels.

| Asset under `src/assets/tutorial/koreader/` | Source                        | Left | Top | Width × height |
| ------------------------------------------- | ----------------------------- | ---: | --: | -------------- |
| `status-menu.png`                           | Status/1.png                  |    0 |   0 | 1072 × 1018    |
| `status-overlap.png`                        | Status/2.png                  |    0 |   0 | 1072 × 745     |
| `refresh-screen.png`                        | Refresh/1.png                 |    0 |   0 | 1072 × 465     |
| `refresh-eink.png`                          | Refresh/2.png                 |    0 |   0 | 1072 × 465     |
| `refresh-rate.png`                          | Refresh/3.png                 |    0 |   0 | 1072 × 188     |
| `refresh-every-page.png`                    | Refresh/4.png                 |    0 |   0 | 1072 × 286     |
| `tweak-tools.png`                           | Tweak document settings/1.png |    0 |   0 | 1072 × 828     |
| `tweak-menu.png`                            | Tweak document settings/2.png |    0 |   0 | 1072 × 551     |
| `tweak-editor.png`                          | Tweak document settings/3.png |    0 |  70 | 1342 × 569     |
| `opds-menu.png`                             | OPDS/1.png                    |    0 |   0 | 1072 × 926     |
| `opds-add-catalog.png`                      | OPDS/2.png                    |    0 |   0 | 1072 × 603     |
| `opds-setup.png`                            | OPDS/3.png                    |  104 |  55 | 864 × 766      |
| `opds-catalog.png`                          | OPDS/4.png                    |    0 |   0 | 1072 × 320     |
| `opds-download.png`                         | OPDS/5.png                    |   54 | 734 | 964 × 340      |

The recommended-settings page shows one useful main image per task and native `<details>` steps for the preceding menus. The connecting page uses the same presentation: Recently converted as the main image, with catalog setup and download controls in expandable steps. Repeat the main image at its corresponding step inside every walkthrough, including manual/online mapping and sharing, so readers do not have to scroll back to follow the sequence. Reuse the same capture variants and URLs: repeated instances do not generate new assets, and browsers can reuse already downloaded variants. No GIF, custom gallery, or new client-side interaction dependency is needed. Browser tests verify initially collapsed steps, the repeated image within the expanded sequence, keyboard expansion, loaded images, responsive layout, and axe accessibility in both languages/themes/viewports. They cannot verify the physical reader. Catalog fields, Save, Choose folder, and the format button's download action were checked against [KOReader's OPDS browser source](https://github.com/koreader/koreader/blob/master/plugins/opds.koplugin/opdsbrowser.lua).

The Lua example uses `inverse_reading_order` for right-to-left tap/swipe behavior only. Readers preserve the existing configuration structure, replace the example directory, and back up the file. Review the [official plugin instructions](https://github.com/koreader/koreader/wiki/Tweak-document-settings-by-directory) and current KOReader source when changing this guidance.

## Remaining planned positions

Run the local development guide to see the **Planned image / GIF** callouts (**Imagem / GIF planejado** in Portuguese). Starlight's existing Aside component displays each remaining capture description and stable ID. Production omits author notes entirely.

| Placement ID | Page         | Still needed           |
| ------------ | ------------ | ---------------------- |
| `intro-logo` | Introduction | Finished original logo |

Placement IDs/routes/localized descriptions live in [media-plan.mjs](media-plan.mjs), with markers beside the instructions in both MDX locales. [MediaSlot.astro](src/components/MediaSlot.astro) is development-only. Remove a plan entry when both markers are replaced by the real asset. Keep its capture/provenance record here; never publish empty boxes or fake e-reader captures.

## Logo placement

When the final asset arrives:

- Use Starlight's [built-in logo configuration](https://starlight.astro.build/reference/configuration/#logo) for a compact mark beside **Mangabound** in the header. Keep the title visible (`replacesTitle: false`). Check light and dark themes; use theme-specific assets if needed.
- Give the larger illustration one place on the introduction page, at `intro-logo`. Keep it out of tutorial instructions. Use empty alt text if it only repeats the adjacent name; otherwise describe what it adds.
- Replace the favicon with a simple, legible crop of the mark; an intricate illustration may need a simplified small version.
- Add the logo near the repository README opening at its source comment.

No temporary logo or blank branding panel is shipped. Confirm artwork source, license, and permission to distribute before adding it.

## Asset and authoring conventions

1. Automatic app captures follow the source commit. Manually supplied reader media must record version/device, format when known, source, permission, and the task it actually verifies. Review menus after reader-version changes.
2. Use sample data you have permission to distribute. Exclude personal paths, usernames, real LAN addresses, credentials, and manga artwork without redistribution permission. Retaining a specific local address for teaching needs the owner's explicit approval and a clear instruction to use the reader's own app address, as recorded for the supplied OPDS form above.
3. Prefer still PNG/WebP with optional native collapsible steps. Add motion only when it materially teaches the task; provide user controls, reduced-motion behavior, and an accessible still/text alternative.
4. Keep sources in `src/assets/tutorial/` and reuse [TutorialImage.astro](src/components/TutorialImage.astro), which supplies Astro optimization, intrinsic dimensions, lazy loading, native source selection, shared presentation, and a normal link to the full-resolution lossless WebP for small-text inspection. The link uses [Astro's `getImage()` URL](https://docs.astro.build/en/reference/modules/astro-assets/#getimage), not an imported asset's development filesystem URL: the latter may load as an image but return 404 when followed as a document on Windows. The built-in Sharp service uses lossless WebP encoding through [Astro's documented encoder configuration](https://docs.astro.build/en/reference/configuration-reference/#imageserviceconfigwebp), with the shared component's explicit `quality="max"` transform distinguishing the output from cached default-quality images. Do not resize capture bitmaps or replace the service with a custom optimizer. Generated files stay ignored; manual reader sources stay tracked and are not artificially enlarged. Missing referenced captures or manifest variants fail the build.
5. Share identical English-UI assets across translations. Translate meaningful alt text and adjacent instructions, not labels the reader must find in the app.
6. Use `public/tutorial/` only when a public URL is needed (for example video). Prefix URLs with `import.meta.env.BASE_URL`; never hardcode the deployment path.
7. Check legibility, framing, focus, privacy, and accurate instructions visually. Run `npm run site:check` from the root. File existence or page parity alone does not establish meaningful test coverage.
