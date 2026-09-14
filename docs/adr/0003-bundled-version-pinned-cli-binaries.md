# ADR 0003: Bundle version-pinned CLI release binaries

- Status: Accepted
- Date: 2026-09-14

## Context

Mangabound orchestrates mangabind and mangapress. Installing them on first launch would add a network dependency, updater behavior, and version-skew risk to the normal user path. Building them from source in this repository would duplicate Go and Rust toolchains, lengthen builds, and blur ownership of each project's release process.

## Decision

Bundle both CLI tools in every Mangabound installer. Release builds download exact, published GitHub Release artifacts listed in `toolchain.lock.json`; they do not build tool source.

Each pin records the source repository, release tag, protocol version, upstream checksum-file identity, and the asset name, immutable release URL, archive SHA-256, and executable SHA-256 for every supported target. Build preparation downloads the named asset and upstream `checksums.txt`, verifies the checksum file against its committed hash, verifies the archive against both the upstream entry and the manifest, then verifies the executable after unpacking. It runs the tool's version command and protocol handshake before copying it into packaged resources and signing. Startup repeats the executable hash check and validates the tool-reported semantic version and structured-protocol version before enabling jobs.

The initial supported matrix is the intersection of existing release artifacts:

- Windows x64
- Linux x64
- macOS x64
- macOS arm64

The lock is intentionally unpinned until each CLI publishes its first structured-protocol release. A build may run in development mode without bundled tools, but a distributable build must fail if any target is missing or any verification differs.

After those releases exist, a scheduled first-party workflow checks GitHub Releases and opens a pull request updating the lock, provenance, and checksums. It never merges or silently downloads a newer binary at runtime. CI verifies the proposed pins and runs the real pipeline fixtures before a human merges the update.

Local development may use an explicit, visibly marked binary override. Overrides are never accepted by packaging or release jobs.

## Consequences

Mangabound CI needs Node/Electron tooling, not Go and Rust, for normal builds. Reproducing a release means restoring the lockfile and the immutable release assets named by it. Upgrading either tool is an auditable pull request.

If mangabind later exposes a stable public library API, it becomes another adapter option. The domain, application ports, and existing subprocess adapter do not need to change; adopting the API would require a new integration decision, not a rearchitecture.
