# Main process

Electron's main process: the only place that builds the adapters, holds paths, and does anything privileged.

`index.ts` does four things:

1. **Verifies the bundled tools** and, only if they match the lock, builds the workflows around the mangabind and mangapress adapters.
2. **Registers the IPC handlers.** Every handler parses its payload with the schema from `src/shared` before using it, and returns a `WorkflowResult`, never throws across the boundary.
3. **Owns the ids.** Inputs, sessions, output libraries and saved books are handed to the page as opaque ids that this file resolves back to paths. The page never sends a path it typed.
4. **Opens the window** with the sandbox on, context isolation on, Node integration off, and navigation denied, and cleans up (tools, sharing, pending settings writes) before quitting.

It is deliberately thin: behavior belongs in `src/application` and `src/adapters`, where it is unit-tested. This file is covered by the packaged end-to-end tests.
