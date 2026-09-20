# Application

Use cases and the small ports they require. Application code coordinates domain rules and owns no UI or infrastructure details.

- `workflows/single-input.ts` reads, plans and converts one folder, one CBZ or one library, and is the only place that orders the steps of a run: mangabind, then mangapress, then publishing.
- `workflows/preferences.ts` brings the options back at launch, checking what the settings file cannot know (that the folder it remembers is still there), and keeps them as they change.
- `workflows/library-publisher.ts` records each finished book in its output library's catalog.
- `ports/` holds the interfaces those use cases need from the outside world: the two tools, the process runner, the library and settings stores, the book file store, network interfaces, the OPDS server, and online sources. Each has an implementation in `src/adapters`, and a fake in the tests.

A new capability that needs something from outside adds a port here first, and an adapter behind it.
