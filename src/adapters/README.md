# Adapters

Concrete implementations of the application's ports: versioned CLI processes, online sources, delivery mechanisms, persistence, and operating-system services. Adapters depend on application ports, never the reverse.

| Folder                | What it does                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mangabind/`          | Runs mangabind and validates its frozen version 1 protocol; turns its report into a mapping draft and writes the mapping back.                                              |
| `mangapress/`         | The same for mangapress: builds its arguments from the options, validates its events, and converts.                                                                         |
| `process/`            | Starts a subprocess, streams its structured output, and cancels it.                                                                                                         |
| `toolchain/`          | Validates the committed release manifest, executable hashes, release versions and protocol handshakes before any job can run. Only this verified toolchain can be executed. |
| `metadata-providers/` | Online sources for volume data, behind one port, with a shared request that names the service in errors. See `docs/adding-a-metadata-provider.md`.                          |
| `library/`            | The output library's catalog and the atomic copy of a finished book into it.                                                                                                |
| `settings/`           | The versioned settings file, written by rename so it is never half written.                                                                                                 |
| `input/`              | Checks the paths a person added against the disk.                                                                                                                           |
| `opds/`, `network/`   | The OPDS HTTP server and the list of network interfaces it may bind to.                                                                                                     |

Each adapter has unit tests that run without Electron, using recorded real output or an in-memory stand-in for the outside world. They sit under the 100% coverage gate.
