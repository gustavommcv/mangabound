# Main process

Electron's main process: the only place that builds the adapters, holds paths, and does anything privileged.

`index.ts` is bootstrap only — it builds the shared `MainContext`, verifies the toolchain, registers every IPC handler group, opens the window, and cleans up (tools, sharing, pending settings writes) before quitting. The actual work is split by responsibility:

- **`context.ts`** — the `MainContext` type (everything the handlers share: selection maps, the active job/sharing state, the constructed workflow) and `createMainContext()`. A handler-registration function is typed to receive only the `Pick<MainContext, ...>` slice it actually touches, so its real dependencies are visible and checked at its call site.
- **`constants.ts`** — fixed configuration values, such as the OPDS port.
- **`toolchain-bootstrap.ts`** — verifies the bundled tools and, only if they match the lock, builds the workflow around the mangabind and mangapress adapters onto the context.
- **`window.ts`** — opens the window with the sandbox on, context isolation on, Node integration off, and navigation denied.
- **`ipc/*.ts`** — one file per handler group (inputs, conversion, metadata, artifacts, OPDS, settings). Every handler parses its payload with the schema from `src/shared` before using it, and returns a `WorkflowResult`, never throws across the boundary. Selections, sessions, output libraries and saved books are handed to the page as opaque ids that these files resolve back to paths — the page never sends a path it typed.

This whole layer is deliberately thin: behavior belongs in `src/application` and `src/adapters`, where it is unit-tested. `src/main` is covered by the packaged end-to-end tests instead.
