# Desktop release checklist

CI automates the repeatable launch and rendering checks. Compositor policy and real desktop integration still require hands-on verification before a release.

Record the release version, source commit, exact successful CI runs, and hands-on results in the release pull request or a linked verification record. Mark untested checks as pending, with the platform and limitation stated; do not infer a manual pass from a green automated job. Use the actual published downloads for the post-publication checks in [Releasing](../RELEASING.md). Signing/notarization remains unfinished release-hardening work: current unsigned alphas disclose that limitation, not a pass of the signing check below.

The first [published alpha.11 verification](releases/verification/v0.1.0-alpha.11-windows.md) covers all download hashes, Linux package permission listings, and Windows portable conversion, native export, local OPDS acquisition, and full-process recovery. It lists the remaining installer, platform, and desktop checks explicitly; it does not complete this checklist.

## All targets

- Installer is signed/notarized as applicable and contains the exact locked CLI binaries.
- Startup verification accepts intact binaries and presents the repair path for a deliberately corrupted copy. The blocked-status rendering is component-tested; launching the packaged app against a pre-corrupted binary stays manual, because the e2e specs share one Electron session and verification runs once before any spec starts.
- Sharing a library whose `.mangabound/library.json` is corrupt fails with a readable message instead of starting (covered by e2e), and a catalog that corrupts while sharing is answered with a generic error, never parser text or file paths (covered by e2e).
- Custom title bar retains native close/minimize/maximize behavior, keyboard focus, scaling, and reduced motion.
- Opening and locating an artifact delegates to the registered OS application/folder without exposing arbitrary-path IPC.
- The options are kept between sessions (ADR 0014): change the device, format and steps, quit, and open the app again. A damaged `settings.json` starts from defaults with a notice; a missing legacy save location does not block processing. Reset to defaults puts the options back. The e2e suite covers this against the packaged app, in a user data folder of its own.
- Process without choosing a destination. Save one ready book with **Save as…**, several with **Save all to folder…**, and share a pending run through OPDS before exporting. Leave an unsaved book, quit and reopen: it must still be listed, openable and saveable (ADR 0026). The packaged suite covers the conversion/export and window reload paths; a full process restart with an unsaved book is also a release check because the Electron test controller cannot reattach native mocks after `reloadSession`.
- Save several books to a removable FAT/exFAT drive, including a name collision; no existing book may be replaced by Save All, and the pending originals must remain available if the drive is removed mid-export.
- After Save All copies several books but shows a catalog warning, dismiss the warning, remove only the exported copies from the chosen folder, and use Save All again without reprocessing. The pending originals must survive an app restart until the destination catalog and saved-state record both succeed.
- Dragging a manga _folder_ from the file manager onto the queue adds it as a folder row, and dragging a `.cbz` adds a file row. A native drag cannot be scripted, so the e2e suite covers the path resolution with real files and synthetic drag events; the directory case is only checked here (ADR 0010).

## Windows

- Test current Windows at 100%, 125%, and 200% scaling.
- Verify drag, double-click maximize/restore, snap layouts, and multi-monitor movement.
- Convert a book without saving it, install the next version over the first, and check the book is still in the queue. Uninstall, and check `%LOCALAPPDATA%\Mangabound Data` is still there with it.

## macOS

- Test current macOS on the shipped Apple Silicon artifact (Intel is not built or tested — see [RELEASING.md](../RELEASING.md#5-macos-is-apple-silicon-only-on-purpose)).
- Verify traffic-light placement, full screen, Spaces, Gatekeeper, and file associations.

## Linux

- Install each package (`.deb`, `.rpm`, Arch) and run one real conversion as a normal user. The app opens even when it cannot reach its bundled tools, so launching alone proves nothing.
- Check that each package shows an icon in the application launcher (GNOME, KDE, a Wayland launcher such as rofi), and in the window list.
- Test X11 and native Wayland on the supported package.
- Test GNOME/KDE fractional scaling and system file associations.
- On Sway and Hyprland, verify launch, focus, drag regions, compositor-native move/resize, maximize/fullscreen, tiling/floating transitions, and clean shutdown.

The Sway/Hyprland checks remain manual because a headless compositor cannot faithfully validate interactive compositor policy.
