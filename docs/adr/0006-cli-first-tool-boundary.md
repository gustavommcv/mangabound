# ADR 0006: mangabind and mangapress stay CLI-first; Mangabound only orchestrates

- Status: Accepted
- Date: 2026-09-15

## Context

Mangabound coordinates two independently released, checksum-pinned CLI tools (ADR 0003): mangabind (chapter discovery and chapter-to-volume binding) and mangapress (image processing and book rendering). Each has its own repository, its own protocol/ADR discipline, and its own release cadence (`docs/milestones.md` M1).

While designing the multi-manga batch feature, this boundary was nearly crossed twice in the same afternoon: an early draft had Mangabound loop N separate mangabind invocations to fake a "batch" capability mangabind's own `-batch` flag already provides, and a later draft dropped a required capability (per-title manual chapter-to-volume correction) because it looked, at first read, like the CLI didn't support it under `-batch`. Testing the real pinned binary showed both were wrong turns: mangabind already had the batch executor and, separately, an existing convention (`mangabind.json` inside a manga's own folder) that supports manual correction even in batch mode. Neither needed a GUI-side workaround. The near-mistake is the pattern worth guarding against going forward: reaching for a workaround in the orchestrator before confirming what the orchestrated tools actually do, or already could do.

## Decision

mangabind and mangapress are CLI-first tools. Every capability they expose must remain fully usable and meaningful from a plain terminal invocation, independent of Mangabound ever existing. Mangabound is exclusively their orchestrator.

- Mangabound's own code must never reimplement chapter discovery, chapter-to-volume binding, image processing, or book rendering. Those stay exclusively mangabind's and mangapress's jobs. Mangabound's job is choosing inputs, sequencing calls to the two tools, tracking state and progress, and presenting results.
- Before adding GUI-side logic to work around a perceived CLI limitation, verify against the real pinned binary (`vendor/toolchain/<target>/`) what the tool actually does — undocumented conventions and existing flags are easy to miss from source-reading alone (this ADR itself exists because of one: `-metadata-file`'s help text pointer to "the mangabind.json convention").
- If a capability Mangabound needs genuinely doesn't exist in mangabind or mangapress yet, and it belongs to chapter binding or book rendering rather than orchestration, it must be proposed and implemented in that tool's own repository, under that repository's own protocol/ADR discipline — not worked around inside Mangabound.
- Any CLI capability added to support a Mangabound feature must be designed CLI-first: a sensible, documented, standalone terminal invocation (flags, output shape, exit codes) that doesn't assume a GUI caller and isn't hidden or GUI-only.
- When it's genuinely ambiguous whether new logic belongs in the GUI or in one of the CLIs, stop and resolve that question explicitly before implementing either side.

## Consequences

Some Mangabound features will be blocked on an upstream mangabind or mangapress release rather than shippable by a Mangabound-only change — accepted as the cost of keeping both tools independently valuable outside the GUI and keeping the system honest about where logic actually lives.

No hidden or GUI-only CLI flags, output modes, or file conventions. If Mangabound relies on a convention (like `mangabind.json`), that convention must already be a real, documented part of the CLI's own terminal contract.
