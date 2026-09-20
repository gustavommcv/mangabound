# Preload

The narrow, typed bridge between the page and the main process. It exposes one frozen object, `window.mangabound`, whose type is `MangaboundBridge` in `src/shared/runtime-info.ts`; every method is one IPC call and nothing else.

The one thing it does beyond forwarding is resolving the paths of files dropped on the window (`webUtils.getPathForFile`), because the page cannot read them. The main process checks each of those paths against the disk again before accepting it.

It runs in a sandbox, so it imports only types from the rest of the code, never values.
