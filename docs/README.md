# Mangabound Documentation Site

Official multi-language documentation website for **[Mangabound](https://github.com/gustavommcv/mangabound)** — the desktop manga organizer and converter for Kindle, Kobo, and KOReader.

Built with **[Astro](https://astro.build)** + **[Starlight](https://starlight.astro.build)**.

---

## 🌐 Features

- **Multi-Language (i18n)**: English (default) and Portuguese (`pt-BR`) with automatic fallback.
- **Offline Client-Side Search**: Powered by Pagefind.
- **Dark / Light Theme**: Custom styling matched to Mangabound's sober graphite and lavender palette.
- **Ecosystem Guides**:
  - Mangabound Desktop GUI
  - [mangabind](https://github.com/gustavommcv/mangabind) CLI (Go)
  - [mangapress](https://github.com/gustavommcv/mangapress) CLI (Rust)
  - **KOReader Integration & Recommended Settings**
- **Automated CI/CD**: Ready for GitHub Pages deployment via GitHub Actions.

---

## 🚀 Development

### Requirements

- Node.js 22+ (tested on Node.js 24 LTS)
- npm 10+

### Start Local Development Server

```bash
npm install
npm run dev
```

Open [http://localhost:4321/mangabound/](http://localhost:4321/mangabound/) in your browser.

### Build Production Static Site

```bash
npm run build
```

The compiled static website will be generated in `./dist/`.

### Preview Production Build

```bash
npm run preview
```

---

## 📂 Project Structure

```text
.
├── .github/workflows/deploy.yml # GitHub Actions workflow for GitHub Pages
├── astro.config.mjs             # Starlight configuration, sidebar, and i18n locales
├── src/
│   ├── content/docs/            # English documentation (root locale)
│   │   ├── getting-started/
│   │   ├── user-guide/
│   │   ├── koreader/
│   │   ├── cli/
│   │   └── development/
│   ├── content/docs/pt-br/      # Portuguese documentation (pt-BR locale)
│   │   ├── getting-started/
│   │   ├── user-guide/
│   │   ├── koreader/
│   │   ├── cli/
│   │   └── development/
│   └── styles/custom.css        # Mangabound theme color tokens
└── package.json
```

---

## 📄 License & Upstream

- Upstream application repository: **[github.com/gustavommcv/mangabound](https://github.com/gustavommcv/mangabound)**
