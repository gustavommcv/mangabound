# Releasing

How to cut a Mangabound release: bump the version, write the release notes, push a tag, and let `.github/workflows/release.yml` do the rest.

## 1. Bump the version

Edit `package.json`'s `"version"` field. Supported prerelease format, exactly:

```text
x.y.z-alpha.N
x.y.z-beta.N
x.y.z-rc.N
```

For example `0.1.0-alpha.1`, `0.1.0-alpha.2`, `0.1.0-beta.1`, `0.1.0-rc.1`, `0.1.0` (a stable release has no prerelease suffix at all). The hyphenated form is what marks a release `--prerelease` on GitHub — that isn't a separate convention invented for this project, it's exactly what a SemVer prerelease identifier already means, so the release workflow derives it straight from the tag rather than from a separate flag anyone has to remember to set.

**A known tooling limitation, found empirically during this workflow's dry run, not assumed:** the pushed tag's version, minus its leading `v`, must match `package.json`'s version exactly — a `check-version` job in the release workflow enforces this and fails fast if they don't. Separately, on Windows, `@electron/packager`'s version-resource writer only tolerates a version string with **at most four dot-separated segments**. `0.1.0-alpha.1` is exactly four (`0`, `1`, `0-alpha`, `1`) and works — verified against a real packaged `.exe`. A longer prerelease identifier with an extra dot in it (for example a hypothetical `0.1.0-alpha.1.2`, or the `0.1.0-alpha.1-dryrun.1` string used during this workflow's own dry run) pushes that count to five and makes `npm run make` fail outright on Windows with `Incorrectly formatted version string`. Stay within the `x.y.z-alpha.N` / `-beta.N` / `-rc.N` shapes above and this never comes up.

## 2. Write the release notes

Create `docs/releases/v<version>.md` (for example `docs/releases/v0.1.0-alpha.1.md`) before pushing the tag — the release workflow reads this file with `--notes-file` and fails if it's missing. These are user-facing release notes, not an internal PR changelog (GitHub's own `--generate-notes` was deliberately not used for that reason — for a project's first tag especially, it produces a wall of every merged PR back to the beginning, not something a downloading user wants to read).

Write for someone deciding whether to install this, not for a contributor. At minimum, cover: what Mangabound is in one sentence, that it's an alpha, the platforms this release supports, install instructions per platform, whether auto-update exists yet, whether the installers are signed/notarized, macOS architecture support, AUR/AppImage availability, the bundled mangabind/mangapress versions, and how to report a problem. `docs/releases/v0.1.0-alpha.1.md` is the reference shape to copy from for the next one.

## 3. Tag and push

```text
git tag v<version>
git push origin v<version>
```

Pushing a tag matching `v*` is the only thing that triggers `.github/workflows/release.yml` — nothing runs on an ordinary push or PR.

## 4. What the workflow does automatically

1. **`check-version`** fails fast if the tag doesn't match `package.json`.
2. **`build`** — one job per platform (`windows-latest`, `ubuntu-latest`, and a pinned arm64 macOS runner, see below), each running the real `npm run make` and uploading its own output as an ordinary CI artifact. No platform ever touches the GitHub Releases API directly, so three platforms can never race to create or write to the same Release.
3. **`publish`** — runs only once every platform in step 2 has succeeded (a failure on any one platform means no Release is created at all, verified for real during this workflow's dry run, not just read off the YAML). Downloads every platform's artifact, keeps only the files a user should actually download (see "Public assets" below), and creates the Release from `docs/releases/v<version>.md`, marked pre-release whenever the tag has a hyphen.

## 5. macOS is Apple Silicon only, on purpose

The `build` matrix pins an explicit `macos-15` runner label, not `macos-latest`. That alias currently resolves to Apple Silicon, but it's a moving target GitHub has already silently repointed from Intel to Apple Silicon once before — pinning an explicit, non-deprecated arm64 label keeps the architecture a deliberate choice this project made, not a default that could quietly change underneath it. Intel Mac (`darwin-x64`) is a real, listed target in `toolchain.lock.json` but has never actually been built or tested by this project — treat adding it as its own piece of work (a real Intel runner, a real test pass), not a one-line matrix addition.

## 6. Where to check the run

The Actions tab, workflow "Release", filtered to the pushed tag. `build`'s three jobs each show their own `npm run make` output and artifact upload; `publish`'s log shows exactly which files it collected and the `gh release create` call. The created Release itself is at `https://github.com/gustavommcv/mangabound/releases/tag/v<version>`.

## 7. Public assets

The GitHub Release publishes only what a person downloading the app actually needs:

- Windows: the `.exe` installer.
- macOS: the `.zip` archive.
- Linux: the `.deb` and the `.rpm`.

Squirrel's `.nupkg` and `RELEASES` files (its own internal update-feed manifest) are deliberately **not** published as Release assets while there's no update-feed infrastructure to actually use them — publishing files nobody can act on yet just adds confusing choices to the download page. They still exist inside each platform's own CI build artifact (`release-windows-latest`, etc.) if anyone needs to inspect them; only the curated, public-facing Release asset list is restricted.

## 8. Smoke test after publishing — required, not optional

This project's own CI can prove `make` succeeds and that the installed `.deb` launches with the sandbox on (see `.github/scripts/check-deb-sandbox.sh`), but nothing in CI has ever downloaded the _actual published Release asset_ the way a real user would. Before calling a release done:

- **Windows:** download the real `.exe` from the Release page (not a local build), run it, and record the exact SmartScreen wording and click path — update `docs/releases/v<version>.md`'s "Security prompts" section with what was actually seen, replacing the placeholder language if the notes were written before this step ran. Confirm install, launch, and one real conversion.
- **macOS (arm64):** download the real `.zip`, unzip, attempt to open, and record the exact Gatekeeper wording and the bypass steps that actually work on the macOS version tested — same update-the-notes step as Windows. Confirm launch and one real conversion.
- **Linux:** install the real `.deb` on a Debian/Ubuntu machine and the real `.rpm` on a Fedora-family machine (or at minimum confirm `rpm -i` validates without erroring), confirm launch on each.

## 9. Aborting or cleaning up a test release

This is the procedure this project's own dry run actually used and verified works cleanly — safe to repeat:

```text
gh release delete v<test-version> --yes --cleanup-tag
```

This removes the GitHub Release and its tag together, both locally-irrelevant and remote. If a local tag was also created and the delete above didn't touch it (for example the Release was never successfully created), remove it separately with `git tag -d v<test-version>`. Never reuse a test tag string that could be mistaken for a real version — this project's own dry runs used clearly-marked strings like `v0.1.0-alpha.1dryrun2`, matching `x.y.z-alpha.N`'s dot-segment shape closely enough to actually exercise the Windows packaging path, while staying unambiguous about being a test.
