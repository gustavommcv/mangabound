# Tutorial media plan

Screenshots and short GIFs are planned parts of the guide. They illustrate the interaction; the written instructions must remain complete without them.

## See the planned positions

Run `npm run dev` in this directory and open the guide. Each planned position has a visible **Planned image / GIF** callout (**Imagem / GIF planejado** in Portuguese), describing the capture and showing its stable ID. These callouts use Starlight's existing Aside component, not a new visual system.

The positions live beside the corresponding instructions in the MDX pages. Their shared IDs, routes, and localized descriptions live in [media-plan.mjs](media-plan.mjs). The component [MediaSlot.astro](src/components/MediaSlot.astro) displays them only in Astro development mode. `npm run build` and `npm run preview` do not publish them; browser tests check both behaviors. Do not add empty image boxes or broken asset URLs to production pages.

| Placement ID                | Page                   | Position and capture                                                  |
| --------------------------- | ---------------------- | --------------------------------------------------------------------- |
| `intro-logo`                | Introduction           | After the opening sentence: the finished logo                         |
| `quickstart-add`            | Quick start            | After adding input: a folder entering the queue                       |
| `quickstart-save`           | Quick start            | After the final step: results with save/share actions                 |
| `queue-inputs`              | Adding manga           | After input types: folder, library, and CBZ queue examples            |
| `manual-mapping`            | Chapter mapping        | After manual instructions: creating a volume and assigning chapters   |
| `online-mapping`            | Chapter mapping        | After online instructions: choosing a search result and reviewing it  |
| `device-settings`           | Conversion settings    | After device/format guidance: device choice and custom dimensions     |
| `single-book`               | Conversion settings    | After single-book instructions: enabled mode and locked controls      |
| `processing-details`        | Processing             | After progress guidance: overall progress and individual volume bars  |
| `save-results`              | Saving and ready books | After saving instructions: individual save and Save all to folder     |
| `ready-books`               | Saving and ready books | After pending-book guidance: Ready books, View books, and Delete      |
| `share-panel`               | Local sharing          | After starting the server: selected interface and catalog address     |
| `reader-catalog`            | Connecting KOReader    | After downloading instructions: catalog and Recently converted        |
| `reader-statusbar`          | KOReader settings      | After status-bar instructions: Overlap status bar on the device       |
| `reader-refresh`            | KOReader settings      | After refresh instructions: Every page on an e-ink device             |
| `reader-directory-defaults` | KOReader settings      | After directory defaults: Tweak document settings with version/format |

Prioritize the mapping recovery and save/share tasks. Not every page needs media, and repeated screenshots should be replaced with a link to the original explanation.

## Logo placement

When the final asset arrives:

- Use Starlight's [built-in logo configuration](https://starlight.astro.build/reference/configuration/#logo) for a compact mark beside **Mangabound** in the header. Keep the title visible (`replacesTitle: false`). Check light and dark themes; use theme-specific assets if needed.
- Give the larger illustration one place on the introduction page, at `intro-logo`. Keep it out of the tutorial pages' content so navigation and instructions remain the focus. Use empty alt text if it only repeats the adjacent name; use meaningful alt text if it conveys additional information.
- Replace the favicon with a simple, legible crop of the mark. An intricate illustration may need a simplified version at that size.
- Add the logo near the opening of the repository README, where the source comment marks the intended position.

No temporary logo or blank branding panel is shipped while the asset is pending. Confirm the artwork's license, original source, and permission to distribute before adding it.

## Asset and authoring conventions

1. Capture the latest released Mangabound and record its tag. For KOReader, also record the version, device, and open book format. Do not use a CBZ-only menu to illustrate EPUB settings. Verify the actions on the captured release.
2. Use a small sample you have permission to distribute. Remove personal paths, usernames, actual LAN addresses, authentication secrets, and copyrighted manga pages that cannot be redistributed. A schematic/demo book is sufficient to show the interface.
3. Prefer a cropped PNG/WebP for a still. A short GIF is acceptable for an interaction; prefer a user-controlled video when motion is long or essential. Do not make looping animation the only way to learn a task. Check reduced-motion behavior and provide an accessible still/text alternative before shipping animated media.
4. Put optimized screenshot sources in `src/assets/tutorial/` and use Astro's image support from MDX. Use `public/tutorial/` only for assets that need a public URL, such as a GIF/video; prefix those URLs with `import.meta.env.BASE_URL`, not a hardcoded deployment path. The built-link check verifies local image/video targets.
5. Reuse the same English-UI asset from both locale pages. Translate the adjacent explanation, caption, and meaningful alt text; do not duplicate a binary merely because the page is translated. If a real localized capture differs, use a clearly named separate file.
6. Include only useful detail at a readable resolution. Declare dimensions, avoid layout shifts, and lazy-load nonessential below-the-fold images. Alt text describes the task/state, not “screenshot”; decorative images have empty alt text. Provide captions where a device/version distinction matters.
7. Replace the corresponding `<MediaSlot id="..." />` at the same location in both locale pages. Remove its entry from `media-plan.mjs` when the real asset replaces both markers; keep the completed capture record here. Remove the component import from a page if it has no markers left. This keeps the author-preview tests tied to genuinely pending work.
8. Test both locales, light/dark themes, and a narrow viewport with `npm run check`. Manually inspect crops, legibility, motion, focus, and captions. The current page-presence/link tests cannot judge the accuracy or accessibility of a new animation; add a focused regression test if new playback behavior is introduced.

When adding media, update this file with the asset path, source release/device, permission or license, and task verified. Avoid screenshotting a feature before its release merely to fill a planned slot.
