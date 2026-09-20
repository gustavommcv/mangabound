# Shared

The contracts that both sides of the window agree on, and nothing else: zod schemas and the plain types they describe.

- `workflow-contract.ts`: the commands and results of reading, planning and converting, and the schema every conversion command is checked against.
- `settings-contract.ts`: what is kept between sessions. The same schema checks the settings file and what the page sends to be saved, so the two cannot drift.
- `opds-contract.ts`: starting and stopping sharing, and its status.
- `runtime-info.ts`: the type of the bridge the page sees as `window.mangabound`. Adding a method here is the first step of adding an IPC command.
- `toolchain-status.ts`, `job-status.ts`: what the page is told about the tools and about a running job.

Everything here must be serializable. It may import from the domain, never from the application, adapters, or any UI.
