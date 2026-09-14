# Mangabound

Mangabound is a desktop GUI for organizing the HakuNeko → mangabind → mangapress → e-reader workflow. It ingests folders or CBZ files that already exist, helps build and correct chapter-to-volume mappings, produces device-ready books, and exposes the output library through OPDS.

This repository contains the accepted architecture decisions, the tested Electron foundation, the checksum-pinned CLI acquisition layer, and the offline-first chapter mapping core. The first structured releases are locked to mangabind `v0.4.0` and mangapress `v0.5.0`.

## Development

Requirements:

- Node.js 24 LTS
- npm 11+
- `tar` (and `unzip` on Linux/macOS) for verified release extraction

Install and run the development shell:

```text
npm ci
npm start
```

Run the local quality gates:

```text
npm run check
```

Inspect the manual, provider-suggested, warning, and error UI states:

```text
npm run storybook
```

The unit-test gate downloads the two immutable release assets for the current platform, verifies both checksum layers and the unpacked executables, then executes their version and protocol handshakes. Generated binaries remain under ignored `vendor/toolchain/` and are never committed.

Package and exercise the actual Electron application:

```text
npm run package
npm run test:e2e
```

See [the ADR index](docs/adr/README.md) for confirmed decisions and [the milestone plan](docs/milestones.md) for implementation order.

## Bundled CLI updates

`toolchain.lock.json` records the release tag, checksum-file hash, archive hash, and executable hash for all supported targets. A scheduled GitHub Actions workflow checks each tool's latest stable release daily and opens or refreshes a separate pull request when that pin changes. Pull requests are created with a narrowly scoped GitHub App token so normal CI runs on them; repository secrets `TOOLCHAIN_BOT_APP_ID` and `TOOLCHAIN_BOT_PRIVATE_KEY` provide that identity. The bot includes upstream release notes and old/new compatibility information, never updates an installed app at runtime, and never merges its own proposal.

## Scope boundary

Mangabound is neither a manga downloader nor a reader. HakuNeko or the user supplies input files. Opening a generated file delegates to the operating system's default application.
