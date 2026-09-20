# ADR 0013: Online sources for volume data: a fixed list, none chosen, MangaDex first

- Status: Accepted
- Date: 2026-09-19
- Amends: [ADR 0005](0005-product-boundaries-and-anti-goals.md) (which services may be offered, and what they may be used for), [ADR 0008](0008-mapping-starts-from-mangabind-grouping.md) (the lookup it made explicit now has a source to look in)

## Context

ADR 0008 made an online lookup something a person asks for, and left the service behind it unspecified: the only source in the code was a configurable base URL, and a fresh install offered none. What people wanted is the choice a converter's own window gives: a list of sources to pick from, nothing picked to begin with, and the first one on the list being MangaDex, which answers the question this app has (which chapters of a work belong to which volume) for a very large catalogue.

Two things about that had to be settled before it went in.

- **What a source may be.** Mangabound is not a downloader (ADR 0005). Some tools that list many sources are mostly lists of sites that host or aggregate scanlations without a licence. Nothing like that belongs here, and the rule has to be one a contributor can apply without a judgement call.
- **What a source's rules require.** MangaDex publishes rules for third-party apps (read on 2026-09-19 from its API documentation): credit MangaDex; run no advertisements and sell no access; send a real, unspoofed user agent; stay near five requests a second per address; do not hotlink or re-host what scanlation groups publish. Donations are allowed.

Checked against the live API: a work is grouped into volumes differently in each translation. The one used for the fixtures has 13 volumes in English and 21 in Brazilian Portuguese, so a lookup in the wrong language would suggest the wrong volumes with no sign that it had.

## Decision

- **A source is a module built into the app, behind one port, in a fixed list.** There is no plugin loader, no downloaded code and no address a person types in. Adding one is a code change that goes through review, with a folder of its own and one line in the registry (`docs/adding-a-metadata-provider.md`).
- **A source can ask two questions and no others:** which works match a title, and which chapters each volume of a work holds. The port has no way to ask for chapters, pages or images, so a source cannot be used to fetch content. Only volume and chapter numbers are used, and nothing is downloaded.
- **What may be listed.** Only a service's own documented, public API, from a service whose published terms allow this use. Never a site's pages read as an API, never a service that hosts or aggregates scanlations or other unlicensed content, and never anything that needs a credential the app would have to carry. A pull request that adds a source records the terms it checked and what they require.
- **None is chosen until a person chooses it.** The volume editor has a "Chapters from" row with three tabs: the folder names (what mangabind read, offline), an online source, and manual. On the online tab a list shows each source's name, address and a line about it, with "No online source" first and nothing selected. Choosing a source sends nothing; only Search does, and the panel says what is sent ("the title") and what is not used or downloaded. The choice is kept while the app is open, and is not stored between sessions until the settings decision.
- **MangaDex is the first entry, and is credited.** The panel shows "Volume data by MangaDex" with a link, and the README credits it. The link is opened by the main process from the address the source is registered with, over https; the page names a source and never an address. The app is free and carries no advertisements. Its request identifies itself as Mangabound with the repository address, and a lookup is one search and at most two volume queries, each started by a click, far under the limit.
- **Volumes are looked up in the folders' language.** mangabind reads a language out of names such as `(pt-br)`, and it now travels with each chapter. The most common one is sent with the lookup, English is tried when it has no volumes, and English is used when the folders declare none. The panel says which language it looked up.
- **The mapping records the source's id.** A suggestion is saved into `mangabind.json` as `source.provider: "mangadex"`, a stable id rather than the name shown to people, and the editor writes "Suggested by MangaDex" from the list it was given.
- **The earlier configurable base URL is removed.** It existed so the service could be tested without being named, and nothing needs it now: tests use responses recorded from the real service.

## Consequences

The list has one entry, and everything around it is what makes a second one cheap: a shared request that names its service in errors, a schema-and-recorded-fixture test pattern, a registry test that holds every descriptor to the same rules, and the contributor guide.

Known limits: MangaDex can change its API or its terms, and its rules as read here are the ones this ADR was written against, so a change to them is a reason to revisit it; the volumes a translation has are only as good as what its community entered; and the choice of source is not remembered between sessions yet.
