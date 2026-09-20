# Architecture decision records

Accepted decisions are immutable records. If a premise changes, add a new ADR that explicitly supersedes or amends the old one.

| ADR                                                    | Status                                                   | Decision                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [0001](0001-electron-react-and-module-boundaries.md)   | Accepted                                                 | Electron, React, TypeScript, Forge Webpack, and module boundaries                     |
| [0002](0002-shadcn-radix-tailwind-design-system.md)    | Accepted                                                 | shadcn/ui, Radix, Tailwind, and one tokenized design layer                            |
| [0003](0003-bundled-version-pinned-cli-binaries.md)    | Accepted                                                 | Bundled, pinned mangabind and mangapress release binaries                             |
| [0004](0004-testing-and-ci-definition-of-done.md)      | Accepted                                                 | Four testing layers and cross-platform CI gates                                       |
| [0005](0005-product-boundaries-and-anti-goals.md)      | Accepted (amended by 0008, 0009, 0010, 0011, 0012, 0013) | Product responsibilities, capabilities, and explicit anti-goals                       |
| [0006](0006-cli-first-tool-boundary.md)                | Accepted                                                 | mangabind and mangapress stay CLI-first; Mangabound only orchestrates                 |
| [0007](0007-library-indexing-and-opds-delivery.md)     | Accepted (amended by 0009, 0010)                         | Per-folder library catalog and an opt-in, authenticated OPDS server                   |
| [0008](0008-mapping-starts-from-mangabind-grouping.md) | Accepted (amended by 0013)                               | The mapping starts from mangabind's grouping; online lookups only on explicit request |
| [0009](0009-process-modes.md)                          | Accepted                                                 | Process modes: join only, convert only, or both                                       |
| [0010](0010-input-queue.md)                            | Accepted (amended by 0012)                               | The entry screen is a queue of folders and comic files                                |
| [0011](0011-kcc-default-options.md)                    | Accepted (amended by 0014, 0015)                         | The mangapress options start where Kindle Comic Converter's window starts             |
| [0012](0012-libraries-in-the-queue.md)                 | Accepted                                                 | A library is a row in the queue, read as one and named by session, never by path      |
| [0013](0013-online-sources-for-volume-data.md)         | Accepted (amended by 0014)                               | Online sources for volume data: a fixed list, none chosen, MangaDex first, credited   |
| [0014](0014-persisted-settings-and-reset.md)           | Accepted                                                 | Options are kept between sessions, and can be put back to their defaults              |
| [0015](0015-paperwhite-as-the-starting-device.md)      | Accepted                                                 | The starting device is a Kindle Paperwhite, as in Kindle Comic Converter's window     |
