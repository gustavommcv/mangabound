# Adapters

Concrete implementations for versioned CLI processes, metadata providers, delivery mechanisms, persistence, and operating-system services. Adapters depend on application ports, never the reverse.

The `mangabind` and `mangapress` protocol modules validate their frozen version 1 contracts. The
toolchain adapter validates the committed release manifest, executable hashes, release versions,
and protocol handshakes before jobs can be enabled. Feature subprocess orchestration remains a
separate adapter introduced by the single-input vertical slice; it may only resolve binaries from
this verified toolchain.
