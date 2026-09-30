# Main process

Electron's main process: the only place that builds the adapters, holds paths, and does anything privileged.

`index.ts` is bootstrap only — it builds the shared `MainContext`, verifies the toolchain, registers every IPC handler group, opens the window, and cleans up (tools, sharing, pending settings writes) before quitting. The actual work is split by responsibility:

- **`context.ts`** — the `MainContext` type (everything the handlers share: selection maps, the active job/sharing state, the constructed workflow) and `createMainContext()`. A handler-registration function is typed to receive only the `Pick<MainContext, ...>` slice it actually touches, so its real dependencies are visible and checked at its call site.
- **`constants.ts`** — fixed configuration values, such as the OPDS port.
- **`toolchain-bootstrap.ts`** — verifies the bundled tools and, only if they match the lock, builds the workflow around the mangabind and mangapress adapters onto the context.
- **`window.ts`** — opens the window with the sandbox on, context isolation on, Node integration off, and navigation denied.
- **`ipc/*.ts`** — one file per handler group (inputs, conversion, pending books, metadata, artifacts, OPDS, settings). Every handler parses its payload with the schema from `src/shared` before using it, and returns a `WorkflowResult`, never throws across the boundary. Selections, sessions, pending runs and books are handed to the page as opaque ids that these files resolve back to paths. Native Save dialogs run here; the page never supplies an export path.
- **`ipc/result.ts`** — `ok`, `failed` and `toFailure`, which turns whatever a handler caught into what the page is told. An error written for the screen keeps its message; the others get a short one that says what to do, and the error itself goes to the log with `console.error` (there is no log file yet, so it shows when the app is started from a terminal). Something that only makes sense for one handler is mapped by that handler first: `ipc/sharing-failure.ts` for the errors of starting the sharing server, because the same system error codes mean something else from a file operation.

This whole layer is deliberately thin: behavior belongs in `src/application` and `src/adapters`, where it is unit-tested. `src/main` is covered by the packaged end-to-end tests instead, apart from the error mapping, which has unit tests (`tests/unit/to-failure.test.ts`).
