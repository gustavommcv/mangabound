# Mangabound

<!-- Branding: add the finished Mangabound logo here. Placement and asset guidance: website/MEDIA.md. -->

Mangabound is a desktop app for organizing manga chapters into volumes and converting them into books for your e-reader. Choose how chapters are grouped and fine-tune page size, margins, and image quality for your device. Once processed, save your books locally or share them directly with KOReader over your local network.

- Group chapters into volumes.
- Prepare books for devices such as Kindle, Kobo, and reMarkable, or set custom page dimensions.
- Combine a series' chapters and volumes into a single book.
- Save processed books locally or share them with KOReader over your local network.

## Download

Choose your package from [GitHub Releases](https://github.com/gustavommcv/mangabound/releases). Alpha releases are listed as **Pre-release**.

| Platform                         | Package                                   |
| -------------------------------- | ----------------------------------------- |
| Windows x64                      | `.Setup.exe` installer or portable `.zip` |
| macOS, Apple Silicon             | `.zip`                                    |
| Linux, Debian/Ubuntu family, x64 | `.deb`                                    |
| Linux, Fedora/RHEL family, x64   | `.rpm`                                    |
| Linux, Arch, x64                 | `.pkg.tar.zst`                            |

Mangabound is in **alpha**. Read the release notes for installation instructions and signing notices.

## Get started

1. **Add your manga.** Drop chapter folders, a library of manga folders, or CBZ files into the queue.
2. **Choose how to organize and convert it.** Check the volumes, select your device and format, and adjust image settings if needed. Book details let you set each title's name, author, and language.
3. **Process, then save or share.** Follow the progress, save one book or all of them, or share with KOReader over your local network.

Your conversion settings are remembered between sessions. Unsaved books remain under **Ready books**, where you can reopen or delete a pending conversion.

See the [user guide](https://gustavommcv.github.io/mangabound/) for volume editing, single-book mode, custom dimensions, and sharing.

## Local processing

Mangabound accepts chapter folders and CBZ files. Finished books open in your system's default application.

Organization, conversion, and saving run on your computer. Online searches for volumes or an author are optional and use the title and selected work's metadata, not your manga pages. Network sharing runs only when enabled and stops when the app closes.

## Development

Requirements:

- Node.js 24 LTS
- npm 11+
- `tar` (and `unzip` on Linux and macOS) for verified release extraction. On Windows run the npm scripts from PowerShell: the `tar` that ships with Git Bash breaks the toolchain step.

`main` is the latest state and can be ahead of what a release shipped. To build what a given release contains, check out its tag first (`git checkout v0.1.0-alpha.11`).

Install and run the development shell:

```text
npm ci
npm start
```

Run every local quality gate (formatting, lint, types, tests with the coverage gate, Storybook build):

```text
npm run check
```

Browse every screen and state without running the app or the conversion tools:

```text
npm run storybook
```

The unit-test gate downloads the two immutable release assets for the current platform, verifies both checksum layers and the unpacked executables, then executes their version and protocol handshakes. Generated binaries stay under the ignored `vendor/toolchain/` and are never committed.

Package and exercise the actual Electron application:

```text
npm run package
npm run test:e2e
```

What each kind of test covers, and what Storybook is for, is in [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

| Read this                                                          | To learn                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [Documentation Website](https://gustavommcv.github.io/mangabound/) | Official bilingual user guides, KOReader setup, and CLI reference (`website/`)  |
| [Architecture overview](docs/architecture.md)                      | How the code is layered, how a conversion runs end to end, where to change what |
| [Architecture decisions](docs/adr/README.md)                       | Why it is built this way, one short record per decision                         |
| [Contributing](CONTRIBUTING.md)                                    | The gates, the kinds of tests, Storybook, and how to open a pull request        |
| [Adding an online source](docs/adding-a-metadata-provider.md)      | The rules and the steps for offering another source of volume data              |
| [Milestones](docs/milestones.md)                                   | What has been built and what comes next                                         |
| [Release checklist](docs/release-checklist.md)                     | The checks that need hands on a real machine before a release                   |
| [Releasing](RELEASING.md)                                          | How to cut and publish a release, step by step                                  |

## Bundled CLI updates

The app bundles pinned releases of mangabind and mangapress. `toolchain.lock.json` records the versions and archive/executable checksums for each platform. The build and app verify them before use.

Taking a newer release of either tool is a deliberate, manual step: `npm run toolchain:update -- --tool mangabind` (or `mangapress`) pins its latest release after downloading and checking every platform's asset, and you open a pull request with the result. The steps are in [CONTRIBUTING.md](CONTRIBUTING.md#updating-the-bundled-tools) and the reasoning is in [ADR 0017](docs/adr/0017-bundled-tools-are-updated-by-hand.md). Nothing is ever downloaded or updated in an installed app.

## Credits

- **[mangabind](https://github.com/gustavommcv/mangabind)** handles chapter grouping and volume creation.
- **[mangapress](https://github.com/gustavommcv/mangapress)** processes pages and creates the finished books.
- **[MangaDex](https://mangadex.org)** provides optional volume and author metadata. Mangabound is free and ad-free; see the [provider guide](docs/adding-a-metadata-provider.md) for attribution and API requirements.
- **[Kindle Comic Converter](https://github.com/ciromattia/kcc)** informs mangapress's conversion algorithms and Mangabound's default image settings ([ADR 0011](docs/adr/0011-kcc-default-options.md), [ADR 0015](docs/adr/0015-paperwhite-as-the-starting-device.md)).
