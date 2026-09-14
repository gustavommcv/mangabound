# Domain

Pure manga, chapter, volume, mapping, profile, job, and catalog rules. This directory must not import Electron, React, Node filesystem/process/network APIs, or concrete adapters.

`mapping.ts` owns the provider-neutral draft, validation, and deterministic `mangabind.json`
serialization. `mapping-editor.ts` applies every edit through one undoable command boundary. Both an
empty offline start and an optional provider suggestion use these same types and operations.
