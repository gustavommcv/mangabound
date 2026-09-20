# MangaDex response fixtures

Real responses from the public MangaDex API, recorded on 2026-09-19 with a descriptive user agent
(`Mangabound-dev (+https://github.com/gustavommcv/mangabound)`), then trimmed to keep the files
small. The shapes, ids, titles and volume numbers are as the service sent them.

| File                       | Request                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `search-chainsaw-man.json` | `GET /manga?title=Chainsaw%20Man&limit=5&order%5Brelevance%5D=desc`, first three works  |
| `aggregate-en.json`        | `GET /manga/a77742b1-befd-49a4-bff5-1ad4e6b0ef7b/aggregate?translatedLanguage%5B%5D=en` |
| `aggregate-pt-br.json`     | the same work with `translatedLanguage%5B%5D=pt-br`                                     |

The two aggregates are trimmed to the first three volumes plus the `none` group (chapters MangaDex
has not put in a volume). Untrimmed, the English one has 13 volumes and the Brazilian Portuguese one
21: a work is grouped into volumes differently in each translation, which is why the provider asks
for the language the folders declare.

Re-record them the same way if the service changes shape, and keep requests to a handful: the API
allows about five a second and asks for a real user agent.
