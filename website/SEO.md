# Search indexing plan

The goal is for Google to index the documentation site and show it for searches about organizing and converting manga for e-readers. This file is the action plan and its record: a box is checked only when the work is done and verified.

The site stays at the address GitHub Pages provides, `https://gustavommcv.github.io/mangabound/`. There is no custom domain.

The reference is the Veronese Maquetes site, where the same kind of work was done: a title and description for each page, a canonical address, `robots.txt`, a sitemap, structured data, and a review with the SEOquake browser extension. Each of those steps has an entry below, including the ones that do not carry over.

## Starting point (audited 2026-10-04)

What the published site already had, from Astro and Starlight:

- A canonical address on every page.
- `hreflang` links between the English and Brazilian Portuguese version of each page, and `x-default`.
- A sitemap at `sitemap-index.xml`, with the language alternates of each page.
- Open Graph title, description, address, locale and site name.
- A `lang` attribute, one `h1` per page, and a viewport declaration.

What was missing or weak:

- The home page title was `Mangabound | Mangabound`: the name twice and no words a person would search for.
- Page descriptions were 40 to 60 characters and rarely named the product or the task.
- No structured data.
- No `robots.txt` (see the limit below).
- The site was not registered in Google Search Console, so Google had no sitemap submitted.

## 1. Preparation

- [x] Bring local `main` up to date with `gustavommcv/mangabound`. The fork's `main` was 7 commits behind; fast-forwarded to `1f6fcf8`.
- [x] Audit the published pages' `head`, sitemap and `robots.txt`.
- [x] Review what was done in the Veronese Maquetes site.

## 2. Page content

- [x] Home page title that says what the app does, in both languages: `Mangabound: organize and convert manga for Kindle, Kobo and KOReader` and its translation, in place of `Mangabound | Mangabound`. The `h1` and the sidebar still say **Mangabound**.
- [x] A description of 110 to 160 characters for every page, in both languages, that names the task and the product. All 34 pages.
- [x] Site-wide default description that matches the home page (`astro.config.mjs`).
- [x] Every image has alternative text, or is marked as decorative. No page needed a change; the new check keeps it so.
- [x] The not-found page is marked `noindex`. GitHub Pages also serves it at `/mangabound/404.html` with a successful status, so it could have been indexed.

## 3. Structured data

Written by `src/routeData.ts` from `src/structured-data.mjs`.

- [x] `SoftwareApplication` and `WebSite` data on the home page of each language (the equivalent of Veronese's `LocalBusiness`).
- [x] `BreadcrumbList` data on the inner pages, leading to the home page of the same language.

Google shows a rich result for an application only when the data also has ratings or reviews. There are none to declare, so the data describes the app to the search engine and does not change how the result looks.

## 4. Crawling and registration

- [x] Sitemap: already generated at build. Nothing to change.
- [x] A place in `site.config.mjs` for the Google Search Console verification code (`googleSiteVerification`), written into every page when set. It is empty now.
- [x] `robots.txt`: none is added, because one in this repository would have no effect (see the limit below).

## 5. Keep it from regressing

- [x] A check in `npm test` (`scripts/verify-search-data.mjs`) that fails when an indexable page has no title, shares its title with another page, has a description outside 110 to 160 characters, a canonical address that is not its own, no structured data, more or fewer than one `h1`, or an image without alternative text.
- [x] Formatting, linting, type checking, the build, the unit tests at 100% coverage, the browser tests (62) and the media tests (16) pass locally.
- [ ] `npm run check` as a whole. Its `audit` step fails locally on `GHSA-ch52-4w7c-c8xp` (`http-cache-semantics`). It fails the same way on `main` without these changes, so it is not part of this work; CI decides.
- [ ] Remote CI green for the commit, as [CONTRIBUTING.md](../CONTRIBUTING.md) requires. The branch is pushed to the fork; the checks run when the pull request is opened.

## 6. Handoff: what is left for the repository administrator

Sections 1 to 5 were done by a contributor working from a fork (`umenorin/mangabound`), on the branch `feat/site-seo`. The steps below were not done because that account cannot do them:

- **It has no administrator access to `gustavommcv/mangabound`.** Repository topics, the Pages settings and merging into `main` belong to the administrator. Nothing is published until the branch is merged, since the site deploys only from `main`.
- **Topics are a repository setting, not a file.** A pull request cannot carry them.
- **A Search Console property belongs to a Google account.** The owner of the site should hold it, so that access to the search data does not depend on a contributor's personal account. The verification code it gives is the only part that goes into the repository.
- **The host root is another repository.** `https://gustavommcv.github.io/robots.txt` can only come from `gustavommcv/gustavommcv.github.io`.

### Steps an assistant with the administrator's `gh` session can do

- [ ] Open the pull request from `umenorin:feat/site-seo` to `gustavommcv:main`, wait for every check, and squash-merge it, following [CONTRIBUTING.md](../CONTRIBUTING.md).
- [ ] After the merge, confirm the published pages changed:

  ```sh
  curl -s https://gustavommcv.github.io/mangabound/ | grep -o '<title>[^<]*</title>'
  curl -s https://gustavommcv.github.io/mangabound/ | grep -c 'application/ld+json'
  ```

  The title is `Mangabound: organize and convert manga for Kindle, Kobo and KOReader` and the count is `1`.

- [ ] Add the repository topics. The repository had none on 2026-10-04.

  ```sh
  gh repo edit gustavommcv/mangabound --add-topic manga,epub,kindle,kobo,koreader,opds,e-reader,manga-converter
  ```

- [ ] When the administrator has the verification code (next list), set `googleSiteVerification` in `site.config.mjs` to it, in a pull request of its own, and after the deploy confirm it is published:

  ```sh
  curl -s https://gustavommcv.github.io/mangabound/ | grep -o '<meta name="google-site-verification"[^>]*>'
  ```

- [ ] Optional, and only if the repository `gustavommcv/gustavommcv.github.io` exists or is wanted: a `robots.txt` at its root with these lines. It is the only place a crawler reads one for this site.

  ```text
  User-agent: *
  Allow: /

  Sitemap: https://gustavommcv.github.io/mangabound/sitemap-index.xml
  ```

### Steps only the administrator can do, in a browser

- [ ] In [Google Search Console](https://search.google.com/search-console), choose **Add property → URL prefix** and enter `https://gustavommcv.github.io/mangabound/`. A **Domain** property needs DNS and cannot be used here.
- [ ] Choose the **HTML tag** verification method. From `<meta name="google-site-verification" content="…" />`, copy only the value of `content` and hand it to the step above.
- [ ] After that value is published, press **Verify**.
- [ ] Under **Sitemaps**, enter `sitemap-index.xml` and submit it.
- [ ] In **URL inspection**, enter `https://gustavommcv.github.io/mangabound/` and press **Request indexing**. Repeat for `https://gustavommcv.github.io/mangabound/pt-br/`.
- [ ] Open the published home page with the SEOquake extension (**Diagnosis**) and compare with the table below.
- [ ] Over time: links to the documentation from other sites (the tools' READMEs, KOReader and e-reader communities). They are what moves a new site most.

Registering now is worth it although the project is in alpha and has few searches: with no `robots.txt`, Search Console is the only way to give Google the sitemap, and a new site with few links can wait weeks to be found without it. Pages usually appear in the results some days after the request.

## What SEOquake should show after the deploy

Open the published home page, then **SEOquake → Diagnosis**.

| Item                              | Expected                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| URL, canonical, language, doctype | Pass                                                                                                   |
| Title                             | Pass, 68 characters                                                                                    |
| Meta description                  | Pass, 154 characters                                                                                   |
| Headings                          | Pass, one `h1`                                                                                         |
| Images                            | Pass, all with alternative text                                                                        |
| Open Graph                        | Pass                                                                                                   |
| Microformats / schema.org         | Pass                                                                                                   |
| XML sitemap                       | May warn: the sitemap is `sitemap-index.xml` under `/mangabound/`, not `/sitemap.xml` at the host root |
| `robots.txt`                      | Warning: see the limit below                                                                           |
| Meta keywords                     | Warning: decided against, below                                                                        |
| Google Analytics                  | Warning: decided against, below                                                                        |

## Limits of a GitHub Pages project site

- **`robots.txt` is read only at the root of a host.** For this site that is `https://gustavommcv.github.io/robots.txt`, which belongs to a different repository (`gustavommcv/gustavommcv.github.io`), not this one. A file at `/mangabound/robots.txt` is ignored by crawlers. Without a `robots.txt`, everything may be crawled, which is the wanted result; the sitemap reaches Google through Search Console instead of a `Sitemap:` line. SEOquake will report `robots.txt` as missing.
- **Search Console needs a URL-prefix property.** A domain property needs DNS, which a `github.io` address does not offer.
- **The name is shared.** Another, unrelated project called Mangabound exists and is being discontinued. Until it leaves the results, a search for the name alone can show it first. Titles and descriptions therefore say what the app does, not only its name.

## Decided against

- **`meta keywords`.** Veronese has it, and SEOquake reports its absence. Google has not used it since 2009.
- **Google Analytics.** Veronese has it. It does not affect indexing, and it would add tracking and a consent question to an open-source project's documentation. Search Console gives the search figures without it.
- **A social preview image (`og:image`).** [MEDIA.md](MEDIA.md) forbids a temporary logo. Add the image with the finished logo. It affects link previews, not search position.
