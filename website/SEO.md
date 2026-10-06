# Search indexing

The documentation is published at <https://gustavommcv.github.io/mangabound/>. This guide records what the repository provides, what the site owner needs to configure, and the limits of this GitHub Pages project site. It does not promise a search position, indexing date, or a particular search-result appearance.

## What the build provides

Astro and Starlight already supply canonical URLs, language alternatives (`hreflang`), a sitemap, Open Graph metadata, and localized page language. Keep these framework features rather than implementing another sitemap or metadata system. The home pages use a descriptive browser title while keeping **Mangabound** as the visible heading and sidebar label.

Each page has a description of its own task. Write for readers, not a keyword score: [Google may use the description or a passage from the page](https://developers.google.com/search/docs/appearance/snippet), and truncates results according to available space. A preferred editorial length is not a reason to reject an otherwise useful description. There is no character-count build gate.

`src/routeData.ts` uses [Starlight's route middleware](https://starlight.astro.build/guides/route-data/) to add:

- `SoftwareApplication` and `WebSite` JSON-LD on each language's home page;
- `BreadcrumbList` JSON-LD on inner pages, linking to that language's home;
- `noindex` on `404.html`, including when GitHub Pages serves that file at its own address with status 200;
- the Search Console verification tag, only when the owner has supplied its value in `site.config.mjs`.

`src/structured-data.mjs` constructs that small data model and escapes `<` before placing JSON into a script element. The documentation's language varies by page; the application's declared language remains English, matching its controls. This is static build output, not a server or client-side SEO library.

### What the data can and cannot do

The data describes the project; it does not guarantee enhanced search results. Google's [software-app result requirements](https://developers.google.com/search/docs/appearance/structured-data/software-app) include a real rating or review. None is declared because the project has none to publish; never invent one to pass a validator.

Google's [site-name feature](https://developers.google.com/search/docs/appearance/site-names) supports domain and subdomain roots, not subdirectories. `WebSite` remains a semantic description of this documentation, but adding it at `/mangabound/` or `/mangabound/pt-br/` does not establish a separate Google site name. A custom domain would require revisiting deployment URLs and this limitation, not changing the desktop app.

## Verification

After generating the current tutorial images, run `npm --prefix website run check` (or use the root `npm run site:check` to generate them first). The ordinary formatting, linting, type checking, unrestricted dependency audit, build, browser, and media gates still apply. See [README.md](README.md) and [CONTRIBUTING.md](../CONTRIBUTING.md#remote-ci-is-the-completion-gate).

`npm test` also checks the real built HTML with `scripts/verify-search-data.mjs`. It requires:

- an indexable guide in each locale, with no unexpected `noindex` on any documentation page;
- `noindex` on the 404 page;
- distinct nonempty titles, nonempty descriptions, a canonical URL matching the deployed path, one `h1`, the expected page language, and image alternative-text attributes;
- the expected structured-data entities, their identity, URLs, descriptions, languages, and ordered breadcrumbs.

Pure-helper unit tests retain the 100% coverage gate. `tests/built/search-data.test.mjs` uses the output of the actual Astro/Starlight build, not handwritten stand-ins for the framework. Its deliberate mutations prove that a globally or individually excluded guide, empty JSON, a wrong entity URL, a breadcrumb crossing locales, and a missing 404 directive fail. These are checks of this site's contract, not a general schema.org validator or proof that Google will use the markup.

After a push, verify the exact commit's remote CI. After an authorized merge, verify the resulting `main` commit's CI, deployment, and published output. Local success alone does not authorize publication.

## Owner setup in Google Search Console

Registration belongs to the site owner's Google account. An empty verification setting does not establish whether a property exists or whether another verification method was used. Confirm that status with the owner rather than recording a guess as an audit result.

1. Open [Google Search Console](https://search.google.com/search-console). Use an existing property for this URL, or add a **URL-prefix** property for `https://gustavommcv.github.io/mangabound/`. A Domain property requires DNS access, which the project does not have for `github.io`.
2. For **HTML tag** verification, copy only the tag's `content` value into `googleSiteVerification` in `site.config.mjs`, in a reviewed PR. That value is public verification metadata, not a password. Keep it empty until supplied; do not substitute a placeholder.
3. After the authorized deployment, confirm that the homepage contains the verification tag, then select **Verify** in Search Console.
4. Under **Sitemaps**, submit `sitemap-index.xml` and check its processing status.
5. Optionally use **URL inspection → Request indexing** for the English and Portuguese homepages. [A request does not guarantee indexing](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl), immediately or at all. Monitor the reports rather than relying on a browser extension's score.

Search Console is a useful submission and diagnostic tool, not a requirement for a page to be discovered through ordinary links. See Google's [sitemap submission options](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

## Hosting and maintenance

- **Robots policy belongs to the host root.** Crawlers read `https://gustavommcv.github.io/robots.txt`, not `/mangabound/robots.txt`; see [Google's location requirements](https://developers.google.com/crawling/docs/robots-txt/create-robots-txt). The root is managed separately from this project. No redundant project-level file is added. If the owner manages the root site, its policy may reference this project's sitemap; review that policy for all projects it affects.
- **Repository topics are optional discoverability metadata.** They belong to repository settings, not this PR. Adding them requires the owner's approval and is separate from Search Console or the site's build.
- **No tracking is added.** Google Analytics is not needed for the changes here. Search Console provides search reports without adding visitor-tracking scripts to the documentation.
- **No meta keywords or temporary branding.** The site does not add keyword tags to satisfy an extension's score. Add a social preview image with the finished, approved logo, following [MEDIA.md](MEDIA.md), rather than shipping a placeholder.
- **Descriptions follow the pages.** Update both locales with actual UI changes. Preserve local KOReader sharing in the main description and do not describe planned capabilities as shipped.
