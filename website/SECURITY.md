# Documentation dependency audit

`npm run audit` uses the lockfile-pinned `audit-ci` CLI to run npm's audit over **all** website dependencies, including development dependencies. Low, moderate, high, and critical findings block the build unless an owner-approved, unexpired exception matches the exact advisory and dependency path. The full npm report remains visible, including accepted findings. Registry failures are failures, not clean audits. `npm run check` includes this gate locally and in documentation CI; the application's separate `npm audit --omit=dev` gate is unchanged.

**No exception is in effect.** The allowlist in `audit-ci.json` is empty, and a test says so: adding a record means changing that test in the same PR.

## Overrides in effect

An override makes a dependency use a version it did not ask for, so each one is recorded here with its evidence and the condition for removing it.

- **`postcss-selector-parser` is forced to `^7.1.6`** (since 2026-10-06). [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), moderate: quadratic complexity in selector parsing can exhaust the CPU in versions below 7.1.6. The one path to it is `@astrojs/starlight`, `astro-expressive-code`, `@expressive-code/core`, then `postcss-nested@6.2.0`, which asks for `^6.1.1`. The newest published `@expressive-code/core` (0.44.2) still asks for `postcss-nested@^6`, and npm's only suggested fix was rolling Starlight back to 0.21.5.
- **Evidence:** the site built before and after is the same, file by file (209 files). The one exception is `pagefind/pagefind-entry.json`, whose bytes also differ between two builds of the same tree and whose content is equal. The unit, browser and media tests and the audit pass.
- **Remove it** when a published `@expressive-code/core` depends on a `postcss-nested` that asks for the patched parser (`postcss-nested@8.0.1` asks for `^7.1.4`), then build, test and audit again.

## What an exception requires

An exception is temporary and is the repository owner's to approve, in a reviewed PR that adds:

- an exposure assessment here: what the advisory describes, why this deployment is not exposed, and for which versions that was checked;
- records in `audit-ci.json` for the exact advisory and dependency paths, never package-wide, advisory-wide or wildcard, with a UTC expiry that `audit-ci` enforces;
- tests through the real auditor showing that the finding is accepted only on those paths, and that removing or expiring the exception, another advisory, a development-dependency advisory and a registry failure all still fail;
- a guard that fails when the assessed conditions change (the versions, the site's output mode), for as long as the exception lasts.

If no fix exists by the expiry, publication stays blocked until the owner approves a new assessment and expiry. Do not extend the date automatically, raise the severity threshold, skip development dependencies, or convert audit errors into success.

## History

### GHSA-ch52-4w7c-c8xp, 2026-10-03 to 2026-10-04

[The advisory](https://github.com/advisories/GHSA-ch52-4w7c-c8xp): in `http-cache-semantics` up to 4.2.0, a client's `Cache-Control: max-stale` can make a shared HTTP cache reuse responses that should require revalidation. Astro depends on the package for its remote-image build helpers, and no patched version existed.

The owner approved an exception on 2026-10-03, expiring 2026-10-17, for `astro@7.3.5` with `http-cache-semantics@4.2.0`: the site is static, GitHub Pages receives only `website/dist`, and the installed Astro does not call the vulnerable reuse methods. It was six exact path records, a scope guard and its tests.

`http-cache-semantics@4.3.0` was published on 2026-10-04 with the fix. The lockfile was updated to it, and the records, the guard and its tests were removed, as that exception's own removal procedure asked. The audit tests now cover the empty policy: the locked version is outside the recorded advisory's range, and the recorded advisory, any other advisory at any severity, a development-dependency advisory and a registry failure all fail.
