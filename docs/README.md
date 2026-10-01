# Contributor documentation

These documents explain how Mangabound is built, decided and released. They are plain Markdown that GitHub renders, and they change with the code, in the same pull request. The user guide (installing, using the app, connecting KOReader) is a website, in [`../website`](../website/README.md), published at <https://gustavommcv.github.io/mangabound/>.

| Read this                                                | To learn                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [Architecture overview](architecture.md)                 | How the code is layered, how a conversion runs end to end, where to change what  |
| [Architecture decisions](adr/README.md)                  | Why it is built this way, one short record per decision                          |
| [Adding an online source](adding-a-metadata-provider.md) | The rules and the steps for offering another source of volume data               |
| [Milestones](milestones.md)                              | What has been built and what comes next                                          |
| [Release checklist](release-checklist.md)                | The checks that need hands on a real machine before a release                    |
| [Release notes](releases/)                               | One file per published version; the release workflow publishes them as they are  |
| [Audit, September 2026](audit-2026-09.md)                | The first architecture and code-quality audit, with what was done about it       |
| [Audit, 30 September 2026](audit-2026-09-30.md)          | The second audit: findings with evidence, the plan, and what has been done since |
| [Audit, 1 October 2026](audit-2026-10-01.md)             | A narrow audit of what the earlier ones did not read, before the release         |

The contributor guide is [`../CONTRIBUTING.md`](../CONTRIBUTING.md) and the release steps are in [`../RELEASING.md`](../RELEASING.md).
