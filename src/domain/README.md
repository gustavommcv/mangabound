# Domain

Pure manga, chapter, volume, mapping, profile, queue and preference rules. This directory must not import Electron, React, Node filesystem/process/network APIs, or concrete adapters.

| Module              | What it owns                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mapping.ts`        | The provider-neutral chapter-to-volume draft, its validation, and the deterministic `mangabind.json` serialization.                                                            |
| `mapping-editor.ts` | Every edit to a draft, through one undoable command boundary. An empty offline start, mangabind's own grouping and an online suggestion all use the same types and operations. |
| `input-queue.ts`    | The queue of folders, files and libraries: its reducer, what each row says about itself, and what a run will and will not do with it.                                          |
| `run-report.ts`     | The outcomes of an input or library run, cancellation decisions, omission reasons and fix actions, completed rows and the run summary. Artifact payloads remain opaque.        |
| `output-profile.ts` | The mangapress options, their validation, and the state they start in, which is Kindle Comic Converter's window (ADR 0011, ADR 0015).                                          |
| `process-mode.ts`   | The closed set of processes a run can be: join only, convert only, or both (ADR 0009).                                                                                         |
| `preferences.ts`    | What is kept between sessions.                                                                                                                                                 |
| `book-details.ts`   | The title, author and language typed for one item, and how they become the title of each book (ADR 0030).                                                                      |
| `conversion.ts`     | The shapes of a conversion request, its progress, its results and its errors.                                                                                                  |
