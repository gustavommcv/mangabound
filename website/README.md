# Documentation website

The user guide lives in `src/content/docs/`, in English and Brazilian Portuguese. [Astro](https://docs.astro.build/) and [Starlight](https://starlight.astro.build/) provide the static site, accessible navigation, theme switching, localized search, and tabs. Shared theme tokens live in `src/styles/custom.css`; do not replace framework components to achieve a color change.

The website is an independent npm package inside the application repository. It does not import Electron, run conversion tools, or need the application's dependencies. The architecture documents, ADRs, release notes, and provider instructions stay in [`../docs/`](../docs/README.md) as canonical repository documents, and the website pages link to them instead of maintaining a second copy.

## Develop and verify

From this directory, with Node.js 24+ and npm 11+:

```text
npm ci
npx playwright install chromium
npm run check
npm run dev
```

Open <http://localhost:4321/mangabound/>. `npm run build` generates `dist/`; `npm run preview` serves that production output, including the Pagefind search index. Search must be tested against a production build, not only the development server.

On Linux, Playwright may need `npx playwright install --with-deps chromium`. If a local browser download is unavailable, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can point to an existing Chromium executable. CI always installs Playwright's matching browser.

Stop any manual development or preview server before running browser checks: Astro's server locks apply per project, even on different ports. Use `npm exec -- astro dev stop` or `npm exec -- astro preview stop` for a server you started. The tests start their own fresh servers and deliberately do not reuse an existing one.

`npm run check` runs formatting, linting, Astro/TypeScript diagnostics, the production build, verification-helper unit tests, translation parity, built-page links/media/anchors, and Playwright browser tests. Browser tests cover real navigation, keyboard-operated tabs/search, language switching, localized search, 404 responses, mobile overflow, and axe accessibility scans in both themes and languages. A separate development-server suite verifies planned media markers at their actual positions and in both languages; the production suite verifies that these author notes are absent. They test the website, not Electron or a physical e-reader. The root application's separate gates still apply.

Link verification resolves the URLs the browser will use, using the shared `site.config.mjs` deployment base. Unit tests deliberately include broken routes, anchors, media, and Windows paths; a green check must prove those failures are detectable. The pure verification helpers have a 100% line/branch/function coverage gate using Node's built-in test coverage. External links are counted but not fetched in CI: review primary sources when changing technical guidance, without depending on third-party uptime for every build.

## Dependency audit

Before publishing, `npm run check` also runs `npm run audit`: npm's full dependency report checked by lockfile-pinned `audit-ci`, with every severity blocking by default. [SECURITY.md](SECURITY.md) records the owner-approved, expiring exception and its exposure analysis, scope guards, regression tests, and removal procedure. Do not replace this gate with a higher severity threshold or omit development dependencies. The desktop application's audit is separate and unchanged.

## Write or translate a page

- Add the English page and the same relative path under `src/content/docs/pt-br/` together. Parity checks page presence, not translation quality; review both texts.
- Use the application's **actual English control labels** in both languages. Explain the task around them; do not invent buttons or silently translate a label the reader cannot find.
- Describe the latest released app, not a canary branch. Check the running UI and source before describing behavior. Update both locales when released behavior changes.
- Put a topic's explanation in one page and link to it elsewhere. CLI examples are selected tasks; upstream `--help` and the tools' documentation are the full flag reference. Protocol/provider/architecture contracts stay in their source repositories.
- Sidebar children use page slugs, so Starlight obtains each locale's frontmatter title. Group labels have explicit locale translations.
- Use existing Starlight components and Markdown first. New custom code needs a concrete need and behavior tests, not string-presence tests for prose or tests of the framework's internals.
- Use English for code, comments, commit messages, and contributor documents. Portuguese is intentional only in the translated public guide.
- Read [MEDIA.md](MEDIA.md) before adding a screenshot, GIF, video, or the finished logo. `npm run dev` shows clearly labeled callouts at the planned positions. Their shared descriptions live in `media-plan.mjs`; replace each marker with the real asset when ready. Production pages never include author reminders or empty boxes.

## Deployment

`.github/workflows/deploy-docs.yml` verifies every PR and every `main` update on Windows and Linux. Pull requests have read-only permissions and cannot deploy or cancel a production deployment. Publication is restricted to `main`, after both verification jobs succeed. Merging a pull request into `main` publishes the website, following [the repository's branch workflow](../CONTRIBUTING.md#pull-requests).

`site.config.mjs` is the single source of the GitHub Pages base. Production obtains `BASE_PATH` from `actions/configure-pages`; local development defaults to `/mangabound/`. Keep links base-aware and test any hosting change.

Before the first publication, a repository administrator must select **Settings → Pages → Build and deployment → Source → GitHub Actions** and review the `github-pages` environment's deployment rules. A local preview does not enable hosting or establish that production deployment succeeds.

Follow the exact-commit remote-CI completion gate in [CONTRIBUTING.md](../CONTRIBUTING.md). Passing locally is preparation, not evidence that a new remote commit is green.
