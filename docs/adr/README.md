# Architecture decision records

Accepted decisions are immutable records. If a premise changes, add a new ADR that explicitly supersedes the old one.

| ADR                                                  | Status   | Decision                                                              |
| ---------------------------------------------------- | -------- | --------------------------------------------------------------------- |
| [0001](0001-electron-react-and-module-boundaries.md) | Accepted | Electron, React, TypeScript, Forge Webpack, and module boundaries     |
| [0002](0002-shadcn-radix-tailwind-design-system.md)  | Accepted | shadcn/ui, Radix, Tailwind, and one tokenized design layer            |
| [0003](0003-bundled-version-pinned-cli-binaries.md)  | Accepted | Bundled, pinned mangabind and mangapress release binaries             |
| [0004](0004-testing-and-ci-definition-of-done.md)    | Accepted | Four testing layers and cross-platform CI gates                       |
| [0005](0005-product-boundaries-and-anti-goals.md)    | Accepted | Product responsibilities, capabilities, and explicit anti-goals       |
| [0006](0006-cli-first-tool-boundary.md)              | Accepted | mangabind and mangapress stay CLI-first; Mangabound only orchestrates |
