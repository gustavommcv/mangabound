# Documentation dependency audit

`npm run audit` uses the lockfile-pinned `audit-ci` CLI to run npm's audit over **all** website dependencies, including development dependencies. Low, moderate, high, and critical findings block the build unless an owner-approved, unexpired exception matches the exact advisory and dependency path. The full npm report remains visible, including accepted findings. Registry failures are failures, not clean audits. `npm run check` includes this gate locally and in documentation CI; the application's separate `npm audit --omit=dev` gate is unchanged.

**No exception is in effect.** The allowlist in `audit-ci.json` is empty, and a test says so: adding a record means changing that test in the same PR.

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
