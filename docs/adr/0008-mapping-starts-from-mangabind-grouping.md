# ADR 0008: The mapping starts from mangabind's grouping, and online lookups happen only on request

- Status: Accepted
- Date: 2026-09-19
- Amends: [ADR 0005](0005-product-boundaries-and-anti-goals.md) (how the manual mapping starts, and how the optional metadata source is offered)

## Context

Hands-on testing of the packaged app with a real folder named like `Vol.01 Ch.0001 - Title (pt-br) [Group]` opened the mapping editor with no volumes and every chapter unassigned, and showed a red "could not reach external metadata service" error the moment the editor opened.

Checked against the pinned mangabind 0.4.0 binary (ADR 0006 discipline), the first is Mangabound's own doing, not mangabind's:

- mangabind already reads the volume from such names (parser `vol-ch-title`) and groups the folder into `<Title> - Vol.01.cbz`, `Vol.02.cbz`. Its report carries `effective_volume` and a `disposition` for every unit; the GUI discarded both by starting the draft empty.
- A duplicate chapter (the same volume and chapter from two groups) is reported as `conflict` and _still carries_ an `effective_volume`, but mangabind skips every copy. A folder mixing named and unnamed volumes reports the unnamed chapters as `unassigned` with no effective volume.
- `page_count` counts a folder's direct pages only. A library child that merely contains other folders reports `0` pages and `empty`.
- `-o` into a directory that already holds `.cbz` files overwrites them without complaint and leaves other files alone.
- `source.provider` in `mangabind.json` is opaque to mangabind: any string is accepted.

The second is a placeholder base URL that does not resolve, combined with a suggestion panel that searched on its own as soon as it mounted.

## Decision

- **The editor starts from mangabind's own grouping.** A unit is seeded into its effective volume only if mangabind reports it `included`, it has an effective volume, and its chapter number and special suffix are ones `mangabind.json` can represent. `conflict`, `unassigned`, `unparsed`, `empty` and `failed` units stay unassigned, so a duplicate is shown to the user instead of guessed at. Volumes are seeded in numeric order. This applies to a single folder and to a batch title's "Fix mapping" draft alike.
- **This is a start, not a suggestion.** It is offline, derived from mangabind, and edited with the same undoable editor. The header says "Grouped by mangabind · Offline" only while the draft still equals what mangabind proposed, then "Manual mapping · Offline". ADR 0005's rule that manual editing needs no provider is unchanged, and nothing here reimplements chapter discovery or grouping: the seed is mangabind's answer, verbatim.
- **`mangabind.json` is written into the source folder only when the confirmed grouping differs from mangabind's proposal.** Comparison ignores volume ids. When the names already say everything, the file would record nothing and would make a read-only or network folder fail for no reason. The scratch copy handed to `-metadata-file` is always written.
- **Online lookups are opt-in and explicit.** A provider has a stable `id` and a `displayName` (the metadata-provider port gains a `descriptor`), listed through a new `workflow:list-metadata-providers` channel. The suggestion panel exists only when at least one provider is registered. A search leaves the machine only from the Search button or Enter, never on open or while typing, and the panel says "Searching sends the title to <provider>." Failing to list providers never raises an error, since it is an optional feature.
- **Nothing is registered until configured.** The registry offers no provider unless a base URL is set (`METADATA_API_BASE_URL`), so a fresh install has no lookup that cannot work. A real built-in provider replaces this in a later ADR.
- **The IPC command carries the provider.** `search` and `suggest-volumes` take a `providerId`; the work a search returned is now `workId` (it used to be sent as `providerId`).

## Consequences

Opening a folder whose names carry volumes is ready to confirm without touching anything, and the red error is gone. The mapping model still keys chapters by number across the whole title, so a series that restarts chapter numbering in every volume shows a `duplicate_chapter` error in the editor, exactly as it did before; mangabind itself would group such a folder from the names alone, and that gap is left for a decision when it proves real. Choosing which providers exist, how a provider is credited, and where its settings live are decided with the provider work, not here.
