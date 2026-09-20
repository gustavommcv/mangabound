# Adding an online source for volume data

An online source answers one question for the volume editor: which chapters of a work belong to which volume. People pick one from a list, search it by title, and apply what it suggests; they can edit anything afterward. MangaDex is the first. This guide is for adding another.

The decision behind it is [ADR 0013](adr/0013-online-sources-for-volume-data.md). Read it first: it is short, and it is where the rules below come from.

## What a source is, and is not

A source is a module built into the app. It can do two things, and the port (`src/application/ports/metadata-provider.ts`) allows nothing else:

1. `search(title)`: the works that match a title.
2. `suggestVolumes(workId, { language })`: for one work, each volume and the chapter numbers it holds.

It cannot ask for chapters, pages, images or files, and it must never be extended to. Mangabound is not a downloader (ADR 0005).

## Rules

A source is only accepted if every one of these holds. A pull request that adds one states how each was checked.

- **Its own public API.** A service's documented, public API, called as documented. Never a site's pages read like an API, never scraped HTML, never a private or reverse-engineered endpoint.
- **A legitimate service.** Nothing that hosts, mirrors or aggregates scanlations or other unlicensed content, and nothing whose main purpose is to reach such content. If it is unclear, it does not go in.
- **Its terms allow this use.** Read the API terms and any acceptable-use policy. Record the address you read and the date. Common requirements to look for: credit, no advertising or paid access, a real user agent, rate limits, attribution of contributors.
- **Credit is given.** The name is shown wherever its data is used ("Volume data by ..."), with a link to its site, and the README credits it.
- **Metadata only.** Titles, volume numbers and chapter numbers. Nothing else is read or kept.
- **Nothing to carry.** No API key, token or account that the app would have to ship or store. If a service needs one, it is not a fit.
- **Only the title is sent.** The search sends the title the person typed, and the volume query sends the work's id and a language. Nothing about their files, folders or machine.
- **https only,** for the API and for the address given as the homepage.

## Steps

### 1. A folder for it

```text
src/adapters/metadata-providers/<id>/
  protocol.ts    what the service sends, as zod schemas, with parse functions
  provider.ts    the class that implements MetadataProviderPort
```

`<id>` is a lowercase slug (`mangadex`). `mangadex/` is the working example; keep to its shape.

### 2. Describe what it sends

In `protocol.ts`, write zod schemas for the two responses and parse with them, so a service that changes shape fails with a readable message instead of a broken screen. Use `.passthrough()` on objects you only read part of. Throw `MetadataProviderError` (`../errors`), and write messages a person can read, naming the service.

### 3. Write the provider

```ts
import { requestText } from '../http';

export const exampleDescriptor = {
  id: 'example',
  displayName: 'Example',
  homepage: 'https://example.org', // https only: this is what the credit link opens
  description: 'What it is, in a few words',
} as const;

export class ExampleProvider implements MetadataProviderPort {
  readonly descriptor = exampleDescriptor;

  constructor(private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch) {}

  async search(title: string, signal?: AbortSignal) {
    const body = await requestText(this.fetchImpl, {
      url: `https://api.example.org/works?title=${encodeURIComponent(title)}`,
      serviceName: this.descriptor.displayName,
      ...(signal === undefined ? {} : { signal }),
    });
    return parseSearch(body).map((work) => ({
      id: work.id,
      title: work.title,
      provider: this.descriptor.id, // the id, which is what `mangabind.json` records
    }));
  }

  async suggestVolumes(workId: string, options = {}) {
    // ... requestText, parse, and return { volumes: [{ number: '1', chapterNumbers: [1, 2, 3] }] }
  }
}
```

Always go through `requestText` (`../http`). It sends the user agent, reads the answer, and turns a network failure, a rate limit (429) or an error status into the same `MetadataProviderError`, so every source fails the same way. Encode everything you put in a URL.

A volume's `number` is the string the service gives (`"1"`, `"2.5"`); `chapterNumbers` are numbers. Leave out anything that has no number (a service may file loose chapters under "none").

**Language.** If the service groups volumes per translation (MangaDex does), use `options.language`, and fall back to a default when it has none. If it has no such notion, ignore it.

### 4. Add it to the list

One line in `src/adapters/metadata-providers/registry.ts`:

```ts
return [new MangaDexProvider(fetchImpl), new ExampleProvider(fetchImpl)];
```

That is the whole registration. The list order is the order people see. The main process builds its lookup from this list, and the registry test holds every descriptor to the checks listed in step 5, with no change from you.

### 5. Test it

Tests use responses recorded from the real service, not invented ones.

1. **Record.** Make a handful of real requests (a search, and the volumes of one work, in two languages if it has them), with a user agent that says who you are. Keep them few: services rate-limit.
2. **Trim and keep.** Cut the responses down and save them in `tests/fixtures/metadata/<id>/`, with a `README.md` saying what was requested, when, and how it was trimmed. See `tests/fixtures/metadata/mangadex/`.
3. **Write `tests/unit/<id>-provider.test.ts`** with a stub `fetch` that returns the fixtures. Cover, at least: the request URL and headers; the results mapped from a real search; the volumes mapped from a real response; the language behaviour; loose or numberless chapters left out; and each failure (unreachable, rate-limited, an error status, malformed JSON, an unexpected shape). `tests/unit/mangadex-provider.test.ts` is the template. The unit tests hold a 100% coverage gate, so every branch you write is tested.
4. **The registry test needs nothing from you.** It checks each registered descriptor: a lowercase id, a name and description, an `https` homepage, ids that do not repeat.

### 6. Credit it

- Add the service to the credits in `README.md`.
- Amend [ADR 0013](adr/0013-online-sources-for-volume-data.md) with a new ADR that lists the source and records the terms you read (accepted ADRs are not rewritten).
- Nothing else in the interface changes: the list, the credit line and the search all take their text from the descriptor.

## Checklist for the pull request

- [ ] Its own documented public API, and I read its terms on (date, address).
- [ ] Not a site that hosts or aggregates unlicensed content, and not reached through one.
- [ ] Its credit and other requirements are met, and where.
- [ ] Only titles and volume and chapter numbers are read; no key or account is needed.
- [ ] `requestText` is used; errors name the service.
- [ ] Fixtures were recorded from the real service, with a `README.md`.
- [ ] Unit tests cover every branch; `npm run check` passes.
- [ ] The README credits it, and a new ADR records the terms.

## Not accepted

- Any source that returns, links to, or helps fetch chapters, pages or images.
- Scrapers, and anything that depends on a site's HTML.
- Sources that need an embedded key, a shared account or a proxy of the app's own.
- Loading sources from a file, a URL or a setting at run time.

Reasons are in ADR 0005 and ADR 0013. If a case is not covered, ask in the pull request before writing the code.
