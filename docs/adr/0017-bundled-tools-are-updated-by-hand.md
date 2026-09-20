# ADR 0017: The bundled tools are updated by hand

- Status: Accepted
- Date: 2026-09-20
- Amends: [ADR 0003](0003-bundled-version-pinned-cli-binaries.md) (which planned a scheduled workflow that proposes newer pins)

## Context

ADR 0003 pinned mangabind and mangapress to exact releases, and planned a scheduled first-party workflow that would check GitHub Releases every day and open a pull request whenever either tool published a newer one.

That workflow needed an identity of its own. Pull requests opened with the default workflow token do not start the normal CI, so it was written to use a GitHub App token, which meant creating an App and keeping two repository secrets. Those were never created, and from the day the workflow existed it failed every day.

The second thing that became clear is who releases these tools. They are the project's own tools, published deliberately by the same people who maintain Mangabound, so a new release is never a surprise that has to be noticed by a robot. What the project needs is a safe, checked way to take a release when someone decides to, and that already exists as a script.

## Decision

- **There is no scheduled update workflow.** The daily workflow and the GitHub App it needed are removed, along with the secrets it depended on.
- **Updating a pin is a deliberate step, made with a script that already exists.** `npm run toolchain:update -- --tool mangabind` (or `mangapress`, or neither for both) looks up the latest release, downloads every supported platform's asset, checks each against the upstream `checksums.txt` and GitHub's asset digest, unpacks and hashes the executables, runs the version and protocol handshakes, and writes the new pin into `toolchain.lock.json`. A specific release can be named instead of the latest, and a description for the pull request, with the old and new release, the protocol versions and the upstream notes, can be written at the same time. The steps are in CONTRIBUTING.
- **What is guaranteed does not change.** The pins are exact and checksummed, the build and the app verify them before anything runs, nothing is ever downloaded or updated at runtime, and a change to a pin is an auditable pull request that CI packages and exercises on Windows, macOS, Linux and Wayland before a person merges it.

## Consequences

No workflow fails every day, and there is no App or secret to create and keep up. The cost is that a release of either tool is not noticed unless someone runs the script, which is acceptable while the people who publish the tools are the ones who take them in.

If the tools ever have releases published by people who do not also maintain Mangabound, automation is worth reconsidering, with a new ADR and an identity that is actually set up. The manually started release-readiness workflow is unchanged.
