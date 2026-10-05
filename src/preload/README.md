# Preload

The narrow, typed bridge between the page and the main process. It exposes one frozen object, `window.mangabound`, whose type is `MangaboundBridge` in `src/shared/runtime-info.ts`; every method is one IPC call and nothing else.

The one thing it does beyond forwarding is resolving the paths of files dropped on the window (`webUtils.getPathForFile`), because the page cannot read them. The page is not trusted to say what it dropped: `dropped-paths.ts` reads only a real array, by index, so a plain object with a `map` function of its own cannot choose the paths. The main process checks each of those paths against the disk again before accepting it.

It runs in a sandbox, and webpack bundles it, so it imports only types from the rest of the code, plus its own small modules.
