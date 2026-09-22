# ADR 0019: The OPDS server binds a fixed port

- Status: Accepted
- Date: 2026-09-22
- Amends: [ADR 0007](0007-library-indexing-and-opds-delivery.md) ("Network interface", which left the port unaddressed — the server asked the OS for whichever free port it had)

## Context

Reported directly, after ADR 0018 made the catalog address short enough to type: the address still changes every time sharing starts, because the server always asked the OS for a free port (`server.listen(0, ...)`). A catalog added once in KOReader stops working the next time Mangabound shares, and has to be re-added with the new port.

## Decision

- **The port is fixed: `48123`.** Picked in the private/dynamic range, away from common development-server ports (3000, 5173, 8080, and similar) that are likely to already be bound on a machine this app's own contributors develop on.
- **The choice lives in `main`, not the adapter.** `OpdsServerStartOptions.port` is a required field with no default; `NodeOpdsServer` binds whatever port it is given. `main` is the only caller that knows the production port; tests ask for `0` (an OS-assigned port), so running the test suite alongside a real, already-sharing Mangabound instance on the same machine cannot collide.
- **A taken port is a specific, readable error.** `EADDRINUSE` now gets its own message naming the port and telling the person to close whatever is using it, distinct from `EADDRNOTAVAIL`/`EACCES` (a bad interface address), which keeps the existing wording.

## Consequences

Once a person adds the catalog address in KOReader, it keeps working across restarts as long as the LAN address does not change — no more re-adding it every session. The cost is a real, if unlikely, chance that something else on the person's machine is already using port 48123, in which case sharing fails with a clear message instead of silently picking another port. No workaround (retry on a different port, let the person choose one) is implemented; if the fixed port turns out to collide often in practice, that is worth its own decision.
