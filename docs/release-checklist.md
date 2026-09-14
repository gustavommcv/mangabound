# Desktop release checklist

CI automates the repeatable launch and rendering checks. Compositor policy and real desktop integration still require hands-on verification before a release.

## All targets

- Installer is signed/notarized as applicable and contains the exact locked CLI binaries.
- Startup verification accepts intact binaries and presents the repair path for a deliberately corrupted copy.
- Custom title bar retains native close/minimize/maximize behavior, keyboard focus, scaling, and reduced motion.
- Opening and locating an artifact delegates to the registered OS application/folder without exposing arbitrary-path IPC.

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
