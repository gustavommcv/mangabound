# Desktop release checklist

Use a basic smoke test for each release, then select additional checks for the areas changed. This is not a requirement to repeat every desktop/compositor scenario for every alpha.

Record the version, commit, exact green CI runs, tested package/platform, and a short result in the release PR. State unavailable platforms and untested checks explicitly; CI success or an earlier manual test does not prove the current published download works. No separate verification report is required.

## Basic release check

- Confirm application and documentation CI for the exact release commit, following [CONTRIBUTING](../CONTRIBUTING.md#remote-ci-is-the-completion-gate).
- Check version, release notes, published assets, and `SHA256SUMS` as described in [Releasing](../RELEASING.md). Current alphas are unsigned; disclose that limitation rather than recording signing/notarization as passed.
- On available target machines, use the actual published package as a normal user: install or extract it, launch, convert a small input, save the book, and open it with the default application. Launch alone does not prove the converters work.
- Leave a book unsaved, quit, and reopen the app. Confirm it remains available for saving. The automated window-reload check is not a full process restart.

If a changed package or core flow cannot be checked, report the gap before calling that work verified. Do not imply that every shipped platform was manually tested.

## Additional checks when an area changes

| Changed area                                   | Hands-on checks                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Installer, packaging, bundled runtime or tools | Test each affected package/target. Check shortcuts, launcher icons, permissions, file associations, and actual Windows/macOS security prompts; update the installation guide when the steps change. macOS releases are Apple Silicon only ([Releasing](../RELEASING.md#5-macos-is-apple-silicon-only-on-purpose)). |
| Window, theme or accessibility                 | Check keyboard focus, reduced motion, title-bar controls, and representative scaling. Include Windows snap/multi-monitor behavior or macOS full screen/Spaces when those integrations are affected.                                                                                                                |
| Linux window integration                       | Check X11 and native Wayland on affected desktops. Test Sway/Hyprland move, resize, focus, and tiling/floating behavior when compositor integration changes; headless CI cannot prove interactive compositor policy.                                                                                               |
| Input handling                                 | Drag a real folder and CBZ from the file manager. Automated synthetic events do not prove the native drag path.                                                                                                                                                                                                    |
| Preferences, storage or updates                | Check persistence, damaged-settings recovery, defaults, and pending-book survival across upgrade/uninstall. On Windows, app data under `%LOCALAPPDATA%\Mangabound Data` must remain intact.                                                                                                                        |
| Saving or recovery                             | Check name collisions, repeated Save All, catalog-warning retries, and removable FAT/exFAT exports with interruption. Pending originals must remain recoverable; Save All must not replace existing books.                                                                                                         |
| Sharing, catalog or startup verification       | Check OPDS on a real LAN. When the relevant guards change, check damaged catalogs and a deliberately corrupted copy of a bundled binary in an isolated test install. Errors must be actionable and must not expose internal paths.                                                                                 |

Keep the existing automated regressions for these behaviors. Manual checks cover native integration and hardware limits, not a replacement test suite.
