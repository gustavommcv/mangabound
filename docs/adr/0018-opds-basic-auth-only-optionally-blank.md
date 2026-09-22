# ADR 0018: OPDS authentication is Basic-only, and may be left blank

- Status: Accepted
- Date: 2026-09-22
- Amends: [ADR 0007](0007-library-indexing-and-opds-delivery.md) (the authentication decision) and the OPDS line of [ADR 0005](0005-product-boundaries-and-anti-goals.md)

## Context

ADR 0007 made a random token, carried as a `?token=` query parameter on every link the feed itself emits, the default and always-on authentication mode, with Basic authentication as an alternate a person could pick instead. The reasoning given was that "OPDS clients, including KOReader, cannot attach custom request headers."

Reported directly, from real use: the resulting catalog address is unusable on the device this project targets. A Kindle Paperwhite running KOReader has no clipboard to paste into its OPDS-catalog field, so the address has to be typed by hand on an e-ink on-screen keyboard — and with the token mode, that address is the base URL plus a 43-character random token, not something a person can realistically type correctly.

The premise behind choosing token-in-URL does not hold. KOReader's OPDS catalog manager has had dedicated username and password fields for HTTP Basic authentication since 2018 ([koreader/koreader#4248](https://github.com/koreader/koreader/pull/4248)); it is not limited to typing everything into one URL field, and no custom header needs to be attached by hand. Basic authentication was already implemented in Mangabound as the alternate mode, so this is a change of default and a simplification, not new work.

## Decision

- **Basic authentication is the only mode.** The token mode, the `?token=` link decoration on every feed entry, and the `withToken` helper that built it are removed. The catalog address a person is given is always the plain base URL — short enough to type on a device keyboard, or to read out.
- **Username and password are both optional.** Leaving both blank shares without a password: the server treats every request as authorized. This is an explicit, informed choice made in the same panel that already only binds to one chosen LAN interface (ADR 0007) — never a fallback or a workaround.
- **Credentials, when set, are entered in the reader, not the address.** KOReader's own OPDS-catalog fields (or `user:pass@host` for any other client that supports it) carry them; Mangabound's server answers a `401` with a `WWW-Authenticate: Basic` challenge exactly as it already did for the alternate mode.

## Consequences

The address given to a reader is always short enough to type by hand. There is one authentication concept instead of two, with one less thing to explain in the Share panel. A person who wants no password at all now has an explicit, understood way to say so, rather than being pushed toward a token they cannot use.

This does not address downloading more than one book at a time from the catalog — KOReader's OPDS browser fetches one entry at a time, and has no built-in multi-select or batch download ([koreader/koreader#10635](https://github.com/koreader/koreader/issues/10635), open). That is a client-side limitation this ADR does not attempt to solve; it remains open for a future decision.
