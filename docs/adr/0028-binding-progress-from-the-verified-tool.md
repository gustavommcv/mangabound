# ADR 0028: Show binding progress reported by the verified mangabind

- Status: Accepted
- Date: 2026-09-29

## Context

Until now the running screen said "Building volume files…" for the whole time mangabind copied pages into CBZ archives. On a large series that stage is the longest silent one, and the screen gave no sign that it was working. mangabind now offers an opt-in progress side channel (`--progress-json`, [mangabind ADR 0013](https://github.com/gustavommcv/mangabind/blob/main/docs/adr/0013-opt-in-machine-progress.md)): its stdout stays one version 1 report, and stderr becomes newline-delimited events with the current stage and the pages actually copied. Guessing progress from elapsed time or file sizes would be misleading, and parsing mangabind's human output would turn its wording into a contract ([ADR 0006](0006-cli-first-tool-boundary.md)).

The app pins exact tool releases ([ADR 0003](0003-bundled-version-pinned-cli-binaries.md)), so a build can carry a mangabind that predates the channel.

## Decision

- **Capability, not version.** The toolchain verification keeps the `capabilities` each tool's own protocol handshake advertises. The mangabind adapter passes `--progress-json` only when the verified binary lists `progress-json` and a caller asked for progress. A pinned binary without it still works and simply shows no page counts.
- **Strict decoding.** stderr is split into lines (a chunk may end anywhere; a last line without a newline is decoded when the process ends), and each line must be a valid version 1 progress event. A line that is not one fails the run instead of being guessed at. In progress mode stderr is the machine channel, so it is not passed on as a diagnostic; the final stdout report and the exit code stay authoritative.
- **Honest numbers.** The running screen shows "Building volume N of M…" with "X of Y pages copied", straight from mangabind's counts. The last page can be copied before the archive has closed successfully, so the bar stays at 99% or less until mangabind reports the write as completed.
- **Both entry points.** A single title and a library batch report progress. In a batch the event names the current title, and the page counts refer to that title.
- The workflow port gains an optional progress callback on `bind` and `bindBatch`; the domain `ConversionProgress` gains an optional `bindingState`. Nothing else in the report handling changes.

## Consequences

The running screen becomes useful during the longest stage, without depending on any human-readable output. Live counts appear only once the bundled mangabind is a release that advertises `progress-json`; taking that release is the usual reviewed pin update ([ADR 0017](0017-bundled-tools-are-updated-by-hand.md)), and until then the app behaves as before. Unit tests cover chunked and malformed event lines, capability gating, the port callback and its use in the workflow, and a component test and a visual baseline cover the running screen.
