# ADR 0041: The window loads its page from its own scheme, and grants the page only what it uses

- Status: Accepted
- Date: 2026-10-04

## Context

The window is sandboxed, context-isolated and has no Node integration, so the page is meant to be untrusted: everything it can do beyond drawing is an IPC command that main validates. The audit of 2026-10-02 ([P1-01, P1-05 and P1-06](../audit-2026-10-04.md)) found three ways that stance was weaker than it looked, each reproduced on the packaged app:

- The packaged page was loaded from `file://`, and Electron gives such a page extra privileges by default (the `GrantFileProtocolExtraPrivileges` fuse). With them, `fetch` and `XMLHttpRequest` read any `file://` URL, and the CSP's `connect-src … ws: wss:` (there for the development server only) let a WebSocket go to any host. Code that got into the page could read any file the person can and send it anywhere.
- Electron grants every permission request unless told otherwise, and the app set no handler: the page could switch on the microphone, read the location and show notifications.
- Starting to share took whatever address the page named. Only the page limited it to the list on screen, so `0.0.0.0` put the books on every network the device is on.

The fuse cannot simply be switched off: with it off, Electron cannot load a page from inside `app.asar` over `file://` at all (the window stays empty and the app quits with `ERR_FILE_NOT_FOUND`; checked by flipping the fuse in the packaged binary).

## Decision

- **The packaged page is served from its own scheme, `app://mangabound`,** by the main process out of the folder the build put it in (`src/main/app-protocol.ts`). The scheme is registered as standard and secure and nothing more: it does not bypass the CSP and gives no access to files. The development server keeps its own address. Only a `GET` for a file below that folder is answered, and a name that leaves it, carries a backslash or a NUL, or asks for another host is a 404 (`src/main/renderer-files.ts`, under the unit gate).
- **`GrantFileProtocolExtraPrivileges` is off.** Nothing in the app loads from `file://` any more, so no page, now or after a later change, gets those privileges by accident.
- **The page's `connect-src` is `'self'`.** The development server's own socket is the same origin as its page, which `'self'` covers, so `ws:` and `wss:` are gone from the page. A test reads the policy and fails on any source that reaches a host.
- **Only the clipboard write is permitted.** The request, check and device handlers answer yes to `clipboard-sanitized-write`, which the Share panel's Copy button needs, and no to everything else (`src/main/permission-policy.ts`, under the unit gate).
- **Sharing starts only on an address the device has.** The handler asks `canShareOn` of the network port: an address the list offers now, or the loopback address, which no other device reaches. A wildcard, a name or an address that has gone away is refused with its own code, `sharing_address_unavailable`.
- **A packaged end-to-end spec attacks the window** (`tests/e2e/window-policy.e2e.ts`): it asks the real page to read a file, to open a socket and a request to a listener of the test's own, to ask for the microphone, the camera, the location and notifications, and to share on a wildcard. It was checked to fail when each protection is taken away.

## Consequences

- The page's origin changes from `file://` to `app://mangabound`. The renderer keeps nothing in `localStorage` or `IndexedDB`, so nothing is lost.
- A file the build adds to the renderer folder is served with its type from a short list in `renderer-files.ts`; anything not on the list is sent as a plain download, which the page cannot run. A new kind of file (a font, an image) needs a line there.
- The scheme could one day also carry a stricter CSP header. The meta policy stays the source of truth until then.

## Alternatives considered

- **Keep `file://` and the fuse on, and tighten only the CSP.** `connect-src 'self'` matches other `file:` URLs for a `file:` page, so the CSP alone does not stop the read.
- **Switch the fuse off and keep `file://`.** Does not load, as above.
- **Refuse only the permissions the audit named.** The list of permissions grows with each Electron release; an allowlist of the one the app uses does not.
