# Mangabound

Mangabound is a desktop app that turns manga you already have, as folders of chapters or as CBZ files, into books ready for your e-reader.

It is a graphical front end for two small command-line tools that it carries inside itself: **[mangabind](https://github.com/gustavommcv/mangabind)** regroups a folder of chapters into one CBZ per volume, and **[mangapress](https://github.com/gustavommcv/mangapress)** converts a CBZ, or a folder of chapters, into an EPUB, CBZ or PDF sized and tuned for a particular e-reader, the way [Kindle Comic Converter](https://github.com/ciromattia/kcc) does. Mangabound adds what a command line cannot: a queue you drop things on, a volume editor for chapters that do not say which volume they belong to, every option of both tools in one place, and a way to hand the finished books to KOReader over your Wi-Fi.

> **Status: alpha (0.x).** Installers are published on [GitHub Releases](https://github.com/gustavommcv/mangabound/releases). Expect rough edges: no auto-update yet, and the installers aren't code-signed (see the release notes for what that means at install time).

## Download

Grab the file that matches your system from the [latest release](https://github.com/gustavommcv/mangabound/releases/latest):

| Platform                         | File                                            |
| -------------------------------- | ----------------------------------------------- |
| Windows x64                      | the `.exe` installer, or the portable `.zip`    |
| macOS, Apple Silicon             | the `.zip` archive                              |
| Linux, Debian/Ubuntu family, x64 | the `.deb` package                              |
| Linux, Fedora/RHEL family, x64   | the `.rpm` package                              |
| Linux, Arch, x64                 | the `.pkg.tar.zst` package (`pacman -U ./file`) |

Intel Macs and AppImage aren't built for this alpha — see the release notes for why. Arch's package is a direct download, not an AUR submission — AUR is still out of scope.

## What it does

1. **Add.** Drag manga folders, libraries (a folder of manga folders) or `.cbz` files onto the window, or click the drop area to choose them.
2. **Check the volumes.** If the folder names carry them (`Vol.02 Ch.0015 - Title`), the chapters are already grouped and nothing needs editing. If not, the volume editor starts from what mangabind could read and lets you take the grouping from an online source you choose, or assign chapters by hand. Every edit can be undone.
3. **Choose the process.** Join the volumes into CBZ files, convert for an e-reader, or both. Pick the device and format (EPUB, CBZ or PDF). Every option mangapress has is available, starting from the state Kindle Comic Converter's window starts in. For a very long series, **Create one book for the series** makes a single EPUB whose table of contents lists the volumes with their chapters nested underneath (EPUB only for now).
4. **Process.** Items run one after another, with progress (including how many pages have been copied while volumes are built) and a way to cancel. Unsaved books remain available after closing the app. You can delete an unwanted pending conversion from **Ready books**; a confirmation explains that copies already saved elsewhere are unaffected.
5. **Save or share.** Use **Save as…** for one book or **Save all to folder…** for several. Save All remains available if you need to export the set again; existing files are never replaced by that action. You can also open a ready book or share it directly over your network (OPDS) for KOReader, without saving it elsewhere first.

The device, format, process and options are remembered between sessions, and can be put back to their defaults with one button. The last save location is suggested the next time you save; it is never an automatic output destination.

## What it is not

Mangabound is neither a manga downloader nor a reader. It works on files you already have, and opening a finished book is left to your system's default application. It works offline: nothing is sent anywhere unless you pick an online source and search it, and then only a title is sent and only volume and chapter numbers are used. The network catalog runs only while you have started it, on the network interface you chose, and stops when you quit.

## Development

Requirements:

- Node.js 24 LTS
- npm 11+
- `tar` (and `unzip` on Linux and macOS) for verified release extraction. On Windows run the npm scripts from PowerShell: the `tar` that ships with Git Bash breaks the toolchain step.

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
| [Documentation Website](https://gustavommcv.github.io/mangabound/) | Official bilingual user guides, KOReader setup, and CLI reference (`docs/`)     |
| [Architecture overview](docs/architecture.md)                      | How the code is layered, how a conversion runs end to end, where to change what |
| [Architecture decisions](docs/adr/README.md)                       | Why it is built this way, one short record per decision                         |
| [Contributing](CONTRIBUTING.md)                                    | The gates, the kinds of tests, Storybook, and how to open a pull request        |
| [Adding an online source](docs/adding-a-metadata-provider.md)      | The rules and the steps for offering another source of volume data              |
| [Milestones](docs/milestones.md)                                   | What has been built and what comes next                                         |
| [Release checklist](docs/release-checklist.md)                     | The checks that need hands on a real machine before a release                   |
| [Releasing](RELEASING.md)                                          | How to cut and publish a release, step by step                                  |

## Bundled CLI updates

The app is locked to mangabind `v0.6.0` and mangapress `v0.6.0`. `toolchain.lock.json` records the release tag, checksum-file hash, archive hash, and executable hash for all supported targets, and both the build and the app verify them before anything runs.

Taking a newer release of either tool is a deliberate, manual step: `npm run toolchain:update -- --tool mangabind` (or `mangapress`) pins its latest release after downloading and checking every platform's asset, and you open a pull request with the result. The steps are in [CONTRIBUTING.md](CONTRIBUTING.md#updating-the-bundled-tools) and the reasoning is in [ADR 0017](docs/adr/0017-bundled-tools-are-updated-by-hand.md). Nothing is ever downloaded or updated in an installed app.

## Credits

- **[MangaDex](https://mangadex.org)** supplies volume and chapter data when you choose it as an online source in the volume editor. Nothing is sent to it unless you pick it and search, only volume and chapter numbers are used, and nothing is downloaded from it. Mangabound is free and carries no advertisements, as MangaDex's API rules ask. To offer another source, see [the contributor guide](docs/adding-a-metadata-provider.md).
- **[Kindle Comic Converter](https://github.com/ciromattia/kcc)**, whose conversion behaviour mangapress follows and whose window's default options Mangabound starts from ([ADR 0011](docs/adr/0011-kcc-default-options.md), [ADR 0015](docs/adr/0015-paperwhite-as-the-starting-device.md)).
