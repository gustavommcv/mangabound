# Releasing

Releases come from version tags on `main`. The workflow builds the packages and publishes the release notes; manual checks cover the desktop behavior CI cannot verify.

## 1. Bump the version

Update `package.json` and `package-lock.json` together. Use `x.y.z` for a stable release, or one of these prerelease forms:

```text
x.y.z-alpha.N
x.y.z-beta.N
x.y.z-rc.N
```

The tag must be `v` followed by the exact package version. Keep at most four dot-separated segments: longer prerelease identifiers break Windows packaging. A hyphenated version is published as a GitHub prerelease automatically.

## 2. Write the release notes

Create `docs/releases/v<version>.md` from [the template](docs/releases/TEMPLATE.md); publication fails if the file is missing.

Explain what users gain and any action needed before updating. Use Added, Changed, Fixed, and Security as applicable, omit empty sections, and include bundled-tool versions and the comparison link. Keep implementation explanations in the PR or ADR, and link to the installation guide rather than repeating setup steps or the package list.

## 3. Tag and push

Obtain explicit authorization for the version tag; approval to merge a PR does not authorize a release. Verify the application and documentation checks for the exact approved commit of `main`, following [the remote-CI gate](CONTRIBUTING.md#remote-ci-is-the-completion-gate). If the results cannot be verified, stop and report; local checks or an earlier green commit are insufficient.

From that verified commit:

```text
git tag v<version>
git push origin v<version>
```

Tags matching `v*` trigger `.github/workflows/release.yml`; ordinary pushes and PRs do not publish app releases.

## 4. What the workflow does automatically

1. **`check-version`:** compares the tag with `package.json`.
2. **`verify-commit`:** requires a commit reachable from `main` whose latest application CI push run passed. Its bounded wait is a safety net, not permission to skip verification before tagging.
3. **`build`:** builds Windows, Linux, and Apple Silicon packages through `make.yml`, also used by application CI.
4. **`arch-package`:** builds the Arch package through `arch-package.yml`, likewise shared with CI.
5. **`publish`:** waits for every build, collects user-facing assets, generates checksums, and creates the release using the versioned notes.

The commit check is not authorization of the person pushing the tag. Release-tag protection belongs in GitHub settings; see [current priorities](docs/milestones.md#current-priorities).

## 5. macOS is Apple Silicon only, on purpose

The installer matrix uses `macos-15` for the arm64 package. Intel converters are pinned in the tool manifest, but Intel Mac app packages are neither shipped nor validated. Adding support requires an Intel runner and real packaging/conversion checks. Pinning a runner label does not freeze its image or guarantee identical builds.

## 6. Where to check the run

Open GitHub Actions, select **Release**, and find the pushed tag. Check every build and the publication result, then open the corresponding GitHub Release. Do not call publication successful while its jobs are queued, running, or failed.

## 7. Public assets

- Windows x64: Squirrel `.Setup.exe` and portable `.zip`.
- Apple Silicon macOS: `.zip`.
- Linux x64: `.deb`, `.rpm`, and Arch `.pkg.tar.zst`.
- `SHA256SUMS`: hashes of these assets, using their published filenames.

To check downloads, run `sha256sum -c SHA256SUMS`, or `shasum -a 256 -c SHA256SUMS` on macOS, in their folder. Missing files are reported too. Checksums detect incomplete or changed downloads; they are not proof of build origin. Signing, notarization, and build attestations remain [pending work](docs/milestones.md#current-priorities).

Squirrel's `.nupkg` and `RELEASES` stay in CI artifacts, not the public download list: the project has no update feed that could use them.

## 8. Smoke test after publishing

Follow the [desktop release checklist](docs/release-checklist.md): a basic test on available target machines, plus checks relevant to changed integrations. Use the published downloads, not a local build. Keep a short result in the release PR, identifying the tested version, package, and OS; explicitly state remaining gaps rather than producing a separate exhaustive report.

CI tests the packaged app and checks Linux package permissions, but that is not a test of the download a user receives. Installation/sandbox diagnostics also do not prove conversion works. If actual SmartScreen or Gatekeeper instructions change, update both languages of the site's installation guide.

## 8b. Withdrawing a real release

With the owner's approval:

1. Put a withdrawal notice at the top of the release notes, explaining the problem and the version to use.
2. Mark it as a prerelease so it is no longer latest, and remove its downloadable assets while leaving the notes available.
3. Announce the withdrawal and record it beside the release notes in `docs/releases/`.
4. Publish the fix as a new version. Never reuse the tag or version.

There is no update feed to notify installed copies or recall files already downloaded.

## 9. Aborting or cleaning up a test release

For an explicitly identified test release, with the owner's approval:

```text
gh release delete v<test-version> --yes --cleanup-tag
```

If a local test tag remains, remove it with `git tag -d v<test-version>`. Use an unmistakable test version compatible with the packaging limits above; never reuse a version that could be mistaken for a real release.
