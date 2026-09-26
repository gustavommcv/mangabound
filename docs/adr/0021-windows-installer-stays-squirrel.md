# ADR 0021: The Windows installer stays Squirrel; a wizard-based MSI was tried and reverted

- Status: Accepted
- Date: 2026-09-26

## Context

Squirrel.Windows (`@electron-forge/maker-squirrel`) installs silently, with no wizard: no welcome screen, no install-location choice, nothing visibly happening beyond a brief flash of the app auto-launching once, right after the installer exits. A person who just downloaded `v0.1.0-alpha.1` reported this as confusing enough to read as broken - "instala em segundo plano sem avisar nada" - separately from the real bug that same report surfaced (fixed by ADR-adjacent work in `src/main/window.ts`: Electron 44.4.3's `ready-to-show` regression, and the app no longer depending on that event at all).

`@electron-forge/maker-wix` was tried as a replacement: an official, same-version Electron Forge maker wrapping WiX Toolset, producing a traditional MSI with a real wizard (welcome, a directory-choice "Custom Setup" page, install progress, a finish page). Built and installed for real on the machine that reported the original bug:

- The wizard itself worked completely: every page rendered correctly, `UpgradeCode` pinned so successive alphas upgrade instead of installing side by side, a version-encoding scheme (banded by prerelease channel) so `0.1.0-alpha.1`/`-alpha.2`/etc. don't all collapse to the same internal MSI version, `Manufacturer`/Start Menu folder explicitly set to `Mangabound` (Squirrel's own default there comes from `package.json`'s `author` field, `"Mangabound contributors"`, which is exactly what produced the confusing Start Menu folder name that shipped in `v0.1.0-alpha.1` and `v0.1.0-alpha.2`).
- Every shortcut this maker creates (Start Menu, Desktop) points at a generic `StubExecutable.exe` vendored inside `electron-wix-msi`, whose job is to resolve to whichever version is currently installed. That stub crashes with a raw access violation (`0xC0000005`) even completely unmodified, run standalone straight from the npm package with zero arguments - confirmed by running the pristine vendored copy directly, not just the copy this project's own build touches. Nothing in `MakerWixConfig` disables or replaces that mechanism.
- A `perUser` install mode (avoiding the UAC elevation Squirrel never needed) was also tried and is not viable: `electron-wix-msi`'s static WiX template nests the install directory under `ProgramFilesFolder` unconditionally regardless of that setting, so a `perUser` build fails outright for a non-admin user with "The installer has insufficient privileges to access this directory" - confirmed by actually running it, not assumed from the config docs.

## Decision

- **Squirrel stays the Windows installer for this alpha.** Its own real bug (the window never appearing after a shortcut relaunch) is already fixed; its lack of a wizard is a real, known UX gap, not silently accepted, but not one this project has a working replacement for yet.
- **A portable Windows build (`.zip`, unzip and run) ships alongside it**, extending the `MakerZIP` already used for macOS to `win32`. No installer, no admin rights, no shortcut/stub indirection to go wrong - verified by extracting the built zip and launching the exe directly.
- **The MSI wizard path is deferred, not abandoned**, for the same reason AppImage was (see `docs/releases/v0.1.0-alpha.1.md`'s "Known limitations" and the AppImage investigation this project already did): a real, structural defect in a dependency this project doesn't control, not a fragile hack away from working. Revisit if `electron-wix-msi` fixes its stub, or if a different Windows installer approach (a hand-rolled shortcut mechanism instead of relying on the vendored stub, or a different maker entirely) becomes worth the added maintenance surface.

## Consequences

Windows users keep the exact install experience `v0.1.0-alpha.1`/`v0.1.0-alpha.2` shipped (Squirrel, silent, no admin needed), now with a portable no-installer alternative and the window-appearing-after-relaunch bug actually fixed. Nobody gets a wizard yet. The `@electron-forge/maker-wix`, `@electron-forge/maker-squirrel` config, the banded MSI-version scheme, the `UpgradeCode`, and the `perUser` dead end are not preserved as commented-out code anywhere - they're recorded here and in the PR that tried them (`fix/window-ready-to-show-fallback` → `release/windows-msi-and-portable-zip` history) so the next attempt doesn't have to rediscover the same two dead ends first.
