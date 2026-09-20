# Desktop release checklist

CI automates the repeatable launch and rendering checks. Compositor policy and real desktop integration still require hands-on verification before a release.

## All targets

- Installer is signed/notarized as applicable and contains the exact locked CLI binaries.
- Startup verification accepts intact binaries and presents the repair path for a deliberately corrupted copy. The blocked-status rendering is component-tested; launching the packaged app against a pre-corrupted binary stays manual, because the e2e specs share one Electron session and verification runs once before any spec starts.
- Sharing a library whose `.mangabound/library.json` is corrupt fails with a readable message instead of starting (covered by e2e), and a catalog that corrupts while sharing is answered with a generic error, never parser text or file paths (covered by e2e).
- Custom title bar retains native close/minimize/maximize behavior, keyboard focus, scaling, and reduced motion.
- Opening and locating an artifact delegates to the registered OS application/folder without exposing arbitrary-path IPC.
- The options are kept between sessions (ADR 0014): change the device, format and steps, choose an output folder, quit, and open the app again. A damaged `settings.json` and a deleted output folder each start from the defaults with a notice, and Reset to defaults puts the options back. The e2e suite covers this against the packaged app, in a user data folder of its own. Where the file lives is the operating system's per-user app data folder for Mangabound (`%APPDATA%` on Windows, `~/Library/Application Support` on macOS, `$XDG_CONFIG_HOME` or `~/.config` on Linux).
- Dragging a manga _folder_ from the file manager onto the queue adds it as a folder row, and dragging a `.cbz` adds a file row. A native drag cannot be scripted, so the e2e suite covers the path resolution with real files and synthetic drag events; the directory case is only checked here (ADR 0010).

## Windows

- Test current Windows at 100%, 125%, and 200% scaling.
- Verify drag, double-click maximize/restore, snap layouts, and multi-monitor movement.

## macOS

- Test current macOS on Intel and Apple Silicon artifacts.
- Verify traffic-light placement, full screen, Spaces, Gatekeeper, and file associations.

## Linux

- Test X11 and native Wayland on the supported package.
- Test GNOME/KDE fractional scaling and system file associations.
- On Sway and Hyprland, verify launch, focus, drag regions, compositor-native move/resize, maximize/fullscreen, tiling/floating transitions, and clean shutdown.

The Sway/Hyprland checks remain manual because a headless compositor cannot faithfully validate interactive compositor policy.
