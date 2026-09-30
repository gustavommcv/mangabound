# Adapters

Concrete implementations of the application's ports: versioned CLI processes, online sources, delivery mechanisms, persistence, and operating-system services. Adapters depend on application ports, never the reverse.

| Folder                | What it does                                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mangabind/`          | Runs mangabind and validates its frozen version 1 protocol; turns its report into a mapping draft, writes the mapping back, and keeps a folder's author and language in its `mangabind.json`. |
| `mangapress/`         | The same for mangapress: builds its arguments from the options, validates its events, and converts.                                                                                           |
| `process/`            | Starts a subprocess, streams its structured output, and cancels it.                                                                                                                           |
| `toolchain/`          | Validates the committed release manifest, executable hashes, release versions and protocol handshakes before any job can run. Only this verified toolchain can be executed.                   |
| `metadata-providers/` | Online sources for volume data, behind one port, with a shared request that names the service in errors. See `docs/adding-a-metadata-provider.md`.                                            |
| `library/`            | Catalogs, isolated persistent pending runs, and safe export copies into user-chosen destinations.                                                                                             |
| `settings/`           | The versioned settings file, written by rename so it is never half written.                                                                                                                   |
| `fs/`                 | Shared atomic text replacement: exclusive sibling temporary files, retried renames, and cleanup after a failed write or rename. Also provides the rename retry used for books.                |
| `input/`              | Checks the paths a person added against the disk.                                                                                                                                             |
| `opds/`, `network/`   | The OPDS HTTP server and the list of network interfaces it may bind to.                                                                                                                       |

Each adapter has unit tests that run without Electron, using recorded real output or an in-memory stand-in for the outside world. They sit under the 100% coverage gate.

The library catalog, pending-run saved-state record, settings file, and mangabind metadata all use `fs/write-file-atomically.ts`. Their injected filesystem dependencies describe only the operations and return values each adapter needs. The helper keeps the original error if cleanup also fails, and never removes a temporary file whose exclusive creation failed with `EEXIST`; adapter-specific error wrapping remains with the caller. Parent directories are created by the caller. The helper replaces one file; it does not serialize read-modify-write operations across adapters or guarantee persistence through a power loss.
