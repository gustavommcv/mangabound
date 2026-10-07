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

The notes say what changed and what a person updating has to do, and nothing else. They are short (about forty lines is a long one), because the files and the pages of the site already say the rest. The shape is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) with a first section for the upgrade, and `docs/releases/TEMPLATE.md` is the one to copy:

1. A line saying it is an alpha, with a link to the installation guide and a mention of `SHA256SUMS`.
2. **Before you update**: only what needs an action or changes what a person will see (a converter that changes every book, a folder that moves, a setting that means something else now, a fix that asks for an install over the old one). Leave it out when there is nothing.
3. **Added**, **Changed**, **Fixed** and **Security**, one line for each change, in the words of someone using the app and not of someone who changed it. No pull request numbers and no reasons: the reasons are in the ADRs and the audit documents. Leave a heading out when it would be empty.
4. The bundled mangabind and mangapress versions on one line, and the link to the comparison with the previous release.

What does not belong in the notes, because it is the same in every release and lives where a person looks for it: installation steps and the platform table (the installation guide and the README), what the system says about an unsigned installer (the installation guide, updated after the smoke test below), how to check a download, the known limitations and how to report a problem (the site's overview and installation pages). If one of those changes, change the page, not the notes. The list of files is the release's own list of assets.

## 3. Tag and push

Obtain explicit authorization for the version tag; approval to merge a pull request does not authorize a release. Before tagging, verify the remote application and documentation checks for the exact approved commit of `main`, following [the completion gate](CONTRIBUTING.md#remote-ci-is-the-completion-gate). A queued or running check, an earlier green commit, or local checks alone do not satisfy it. If the remote result cannot be verified, stop and report the missing evidence.

From that verified commit:

```text
git tag v<version>
git push origin v<version>
```

Tag a commit of `main`: it is the only long-lived branch, and releases are cut from it. The tag then names exactly what the release was built from.

Pushing a tag matching `v*` triggers `.github/workflows/release.yml`; that workflow does not run on an ordinary push or PR.

The workflow also refuses a commit that is not on `main`, or whose application CI run (the `CI` workflow, on its push to `main`) did not pass; see `verify-commit` below. Its bounded wait handles an unfinished run, but is a safety net, not permission to skip the pre-tag verification above.

## 4. What the workflow does automatically

1. **`check-version`** fails fast if the tag doesn't match `package.json`.
2. **`verify-commit`** requires that the tagged commit is reachable from `main` and that the `CI` workflow ran for exactly that commit, on a push, and passed (`scripts/verify-release-commit.mjs`, which decides from what the workflow asks GitHub; the newest run of the commit is the one that counts). A run that has not finished, or has not started, is waited for; anything else stops the release before anything is built. This is what keeps a tag on a commit that never went green from publishing. It is a check of the commit, not of who pushed the tag: the workflow file is the tagged commit's own, so a rule that only the owner may create `v*` tags (a tag ruleset in the repository settings) is still what protects against a tag made from someone else's branch.
3. **`build`** — one job per platform (`windows-latest`, `ubuntu-latest`, and a pinned arm64 macOS runner, see below), each running the real `npm run make` and uploading its own output as an ordinary CI artifact. Defined once in `.github/workflows/make.yml` and called from here with `workflow_call`, not copy-pasted — `ci.yml`'s `make-verification` job calls the exact same file, so the two can never drift the way they once did.
4. **`arch-package`** — Electron Forge has no maker for Arch/pacman, so this hand-rolls one: packages the app the same way `build` does, then wraps it in a `.pkg.tar.zst` with a PKGBUILD (`packaging/arch/`), following the ArchWiki's Electron package guidelines. Also defined once, in `.github/workflows/arch-package.yml`, shared with `ci.yml`'s `arch-package-verification`. It installs the same default icon the `.deb` and `.rpm` fall back to (Electron's) until the app has an icon of its own, and a gate fails the job when the desktop entry's `Icon=` names an icon the package does not install.
5. **`publish`** — runs only after every `build` matrix job and `arch-package` have succeeded; a failed build prevents publication. Downloads every artifact, keeps only the files a user should actually download (see "Public assets" below), and creates the Release from `docs/releases/v<version>.md`, marked pre-release whenever the tag has a hyphen.

## 5. macOS is Apple Silicon only, on purpose

The shared installer matrix in `.github/workflows/make.yml` selects `macos-15` for the Apple Silicon package instead of `macos-latest`. Intel Mac (`darwin-x64`) is listed in `toolchain.lock.json` but is not a shipped or validated release target. Adding it requires an Intel build runner and real packaging and conversion checks, not just another matrix row. Explicit runner labels do not freeze the runner image or guarantee bit-for-bit reproducible builds.

## 6. Where to check the run

The Actions tab, workflow "Release", filtered to the pushed tag. `build`'s three jobs each show their own `npm run make` output and artifact upload; `publish`'s log shows exactly which files it collected and the `gh release create` call. The created Release itself is at `https://github.com/gustavommcv/mangabound/releases/tag/v<version>`.

## 7. Public assets

The GitHub Release publishes only what a person downloading the app actually needs:

- Windows: the Squirrel `.exe` installer, and a portable `.zip` (unzip and run, no install, no admin rights) for anyone who'd rather not run an installer.
- macOS: the `.zip` archive.
- Linux: the `.deb`, the `.rpm`, and the Arch `.pkg.tar.zst`.
- `SHA256SUMS`: one line for each of the files above, in the format `sha256sum -c` reads (`sha256sum -c SHA256SUMS`, or `shasum -a 256 -c SHA256SUMS` on macOS, run in the folder the files were downloaded to; it reports the files that are missing from that folder as well as the ones that do not match). It is made by the `publish` job from the files it is about to upload, so it shows that a download is what the workflow collected and that it arrived whole. The files are given the names GitHub would give them on upload (a space or a tilde in a name becomes a dot) before the checksums are made, and the job checks after publishing that the names in `SHA256SUMS` are the names of the published files: the first release made with it, alpha.11, listed two files by their local names and not by the published ones. It does not show where the files were built, which would take a signed build attestation: not published yet, and said so in the notes of each release.

Squirrel's `.nupkg` and `RELEASES` files (its own internal update-feed manifest) are deliberately **not** published as Release assets while there's no update-feed infrastructure to actually use them — publishing files nobody can act on yet just adds confusing choices to the download page. They still exist inside each platform's own CI build artifact (`release-windows-latest`, etc.) if anyone needs to inspect them; only the curated, public-facing Release asset list is restricted.

## 8. Smoke test after publishing — required, not optional

This project's own CI proves `make` succeeds, and for every Linux package it reads the listing of the finished file and fails when something in it cannot be used by someone who is not root (`.github/scripts/check-package-permissions.sh`, in `make.yml` for the `.deb` and the `.rpm` and in `arch-package.yml` for the Arch package; the release workflow runs the same steps). It also installs the `.deb` and the Arch package and launches them with the sandbox on (`.github/scripts/check-deb-sandbox.sh` and `.github/scripts/check-pacman-sandbox.sh`), but those two are diagnostics that always exit 0, run only in `ci.yml`, and a launch proves little: the app starts even when its bundled tools cannot be reached. Nothing in CI has ever downloaded the _actual published Release asset_ and converted a book with it the way a real user would. Before calling a release done:

- **Windows:** download the real `.exe` from the Release page (not a local build), run it, and record the exact SmartScreen wording and click path — update the installation guide (`website/src/content/docs/getting-started/installation.mdx` and its `pt-br` page) with what was actually seen. Confirm install, launch, and one real conversion. Also confirm the portable `.zip` extracts and runs directly.
- **macOS (arm64):** download the real `.zip`, unzip, attempt to open, and record the exact Gatekeeper wording and the bypass steps that actually work on the macOS version tested — same update-the-installation-guide step as Windows. Confirm launch and one real conversion.
- **Linux:** install the real `.deb` on a Debian/Ubuntu machine and the real `.rpm` on a Fedora-family machine (or at minimum confirm `rpm -i` validates without erroring), confirm launch on each, then run one real conversion on each as a normal user (not root): the app opens even when it cannot reach its bundled tools, and only a conversion shows it. Install the real `.pkg.tar.zst` with `sudo pacman -U ./mangabound-<version>-1-x86_64.pkg.tar.zst` on a real Arch machine and confirm launch there too — CI's own Arch job runs in a fresh container every time, which is not the same thing as an existing, personally-configured Arch install.

## 8b. Withdrawing a real release

A release that turns out to be bad (a package that does not start, a conversion that is wrong) cannot be recalled from people who already downloaded it: there is no update feed. Published `SHA256SUMS` identifies the original assets and detects a damaged download, but cannot notify an installed app that its release was withdrawn. What can be done, in this order:

1. Edit the release notes on GitHub so that the first line says the release is withdrawn, what is wrong and which release to use instead.
2. Mark the release as a pre-release if it is not one, so that it stops being the "latest" one.
3. Delete the assets of the bad release (the files people would download), leaving the release and its notes, so that the page says what happened instead of a 404.
4. Say it where the project's other news goes, and record it in `docs/releases/` beside the notes of the release it withdraws.
5. Release the fix as the next version. Never reuse the tag or the version string.

## 9. Aborting or cleaning up a test release

This is the procedure this project's own dry run actually used and verified works cleanly — safe to repeat:

```text
gh release delete v<test-version> --yes --cleanup-tag
```

This removes the GitHub Release and its tag together, both locally-irrelevant and remote. If a local tag was also created and the delete above didn't touch it (for example the Release was never successfully created), remove it separately with `git tag -d v<test-version>`. Never reuse a test tag string that could be mistaken for a real version — this project's own dry runs used clearly-marked strings like `v0.1.0-alpha.1dryrun2`, matching `x.y.z-alpha.N`'s dot-segment shape closely enough to actually exercise the Windows packaging path, while staying unambiguous about being a test.
