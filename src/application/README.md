# Application

Use cases and the small ports they require. Application code coordinates domain rules and owns no UI or infrastructure details.

- `workflows/conversion-workflow.ts` is the entry point for reading, planning, converting, saving metadata and releasing a folder, a CBZ or a library. It composes the modules below and preserves the public method contracts.
- `workflows/input-sessions.ts` owns inspected sessions, their trusted paths/drafts, library refresh and metadata saves. Successful single-input conversion spends its session; a failure keeps it for retry. Library runs keep their inspected session, and shutdown releases every remaining scratch workspace.
- `workflows/single-run.ts` plans or converts one folder or CBZ, validating the same preconditions in both operations.
- `workflows/library-run.ts` binds a library once, converts titles sequentially and reports a title's failure with its completed books before continuing. It releases the batch workspace in `finally`.
- `workflows/book-production.ts` supplies the shared book-producing callback: convert with mangapress or copy a joined CBZ, then publish a complete, uniquely named file. Staging failures retain their existing error and cancellation semantics.
- `workflows/run-preconditions.ts` shares output-settings validation, single-book requirements and the empty-binding error factory. `SingleInputRun.assertRunnable` uses the session registry's lookup; libraries keep their distinct validation order, and a loose CBZ still ignores single-book mode.
- `workflows/volume-production.ts` schedules the volumes of one title, aggregates progress and publishes completed books in input order. It receives a book-producing callback and returns a success/failure result with the completed artifacts; it owns no paths, sessions, tool adapters or device settings. A failure stops new work without aborting active producers; user cancellation still reaches every active producer.
- `workflows/preferences.ts` brings the options back at launch, checking what the settings file cannot know (that the folder it remembers is still there), and keeps them as they change.
- `workflows/library-publisher.ts` records each finished book in its pending run's catalog. The pending storage adapter later exports and indexes chosen destinations.
- `ports/` holds the interfaces those use cases need from the outside world: the two tools, the process runner, the library and settings stores, the book file store, network interfaces, the OPDS server, and online sources. Each has an implementation in `src/adapters`, and a fake in the tests.

A new capability that needs something from outside adds a port here first, and an adapter behind it.

The public workflow's unit tests are split by behavior (`tests/unit/workflow-*.test.ts`: preconditions, inputs, libraries, process modes, book details, folder metadata and session lifetimes) and reuse `tests/unit/support/conversion-workflow.ts`. The existing scheduler tests remain independent.
