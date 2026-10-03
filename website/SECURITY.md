# Documentation dependency audit

`npm run audit` uses the lockfile-pinned `audit-ci` CLI to run npm's audit over **all** website dependencies, including development dependencies. Low, moderate, high, and critical findings block the build unless an owner-approved, unexpired exception matches the exact advisory and dependency path. The full npm report remains visible, including accepted findings. Registry failures are failures, not clean audits. `npm run check` includes this gate locally and in documentation CI; the application's separate `npm audit --omit=dev` gate is unchanged.

## Temporary exception: GHSA-ch52-4w7c-c8xp

- Approved by the repository owner on 2026-10-03 after reviewing the exposure analysis.
- Expires at **2026-10-17 00:00 UTC**. Expiration is enforced by `audit-ci`, not by a reminder or an automatic renewal.
- Reviewed versions: `astro@7.3.5` and `http-cache-semantics@4.2.0`, resolved by `package-lock.json`.
- Scope: the reviewed Astro dependency routes for this advisory, recorded as six exact strings in `audit-ci.json`. There are no package-wide, advisory-wide, or wildcard exclusions. npm's cached transitive findings can produce different `audit-ci@7.1.0` path representations, including a trailing `>` or Starlight through MDX. Both the local registry scenario and the real cold-cache CI report are tested. Do not replace these literal records with a wildcard.

The [reviewed advisory](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) describes a real cross-user response disclosure: a client's `Cache-Control: max-stale` can make a shared HTTP cache reuse responses that should require revalidation, including responses carrying another user's `Set-Cookie`. At review time there is no published patched version. [Upstream PR 58](https://github.com/kornelski/http-cache-semantics/pull/58) is still open; this project does not vendor its unmerged patch or downgrade Astro to an incompatible version.

### Why this deployment is not exposed to the described attack

The installed Astro package imports `http-cache-semantics` only in `dist/assets/build/remote.js`. Its remote-image build helpers construct their own requests and call `storable()` and `timeToLive()`. They do not call `evaluateRequest()` or `satisfiesWithoutRevalidation()`, the vulnerable reuse methods, or forward arbitrary visitor request headers. A controlled reproduction against the installed library confirmed that restricted entries have zero TTL but can be incorrectly reused with `max-stale`; the exception does not claim the library is fixed.

The website currently uses local assets. GitHub Pages receives only the static `website/dist` output, with no Node server, shared response cache, or authenticated image endpoint. The vulnerable dependency is a website build input, not an Electron runtime dependency, and is not bundled into the desktop installer. This assessment applies to the reviewed deployment and versions, not every application using Astro.

Before auditing, `scripts/check-audit-scope.mjs` checks the actual Astro configuration and lockfile through the small, coverage-gated `assertAuditScope` helper. Server output, an adapter, version changes, missing copies, relocated copies, or extra copies of either reviewed package require removing or reviewing the exception. The guard is not a general proof of non-exploitability: new integrations, remote-image use, hosting changes, and any new use of the cache library also require a security review.

### Verification and removal

The audit tests exercise the installed CLI and npm against a local registry. `tests/fixtures/cache-advisory.json` is the actual response captured on 2026-10-03 from npm's `/-/npm/v1/security/advisories/bulk` endpoint for `http-cache-semantics@4.2.0`. The registry fixture serves package metadata derived from the real lockfile; it never fetches a third-party service during tests. `tests/fixtures/cache-audit-ci-report.json` is the full npm report from the [Linux documentation job](https://github.com/gustavommcv/mangabound/actions/runs/37097556349/job/111130490862) at commit `9882546d86bbe07f9b6dced5db696260b5a75873`. A test replays that report at the npm CLI boundary through the real auditor and verifies that its additional literal paths must be explicitly accepted; it does not replace or inspect the auditor's internal implementation. Deliberate mutations verify that removing or expiring the exception, another advisory at any blocking severity, a development-dependency advisory, a direct dependency outside the reviewed paths, and registry failure all produce a failing exit status. Separate tests cover scope changes and the real configuration/lockfile.

When a patched compatible version is published, update the lockfile in a reviewed PR, remove the six allowlist records, and remove the temporary scope guard and its tests/coverage entry. Keep `audit-ci` and the all-severity audit gate. Update the audit fixture tests to cover the empty policy and ordinary failure cases rather than retaining an exception that is no longer needed. Confirm the unrestricted audit and every required remote check for the exact PR head before merging.

If no fix exists by expiry, publication remains blocked until the owner explicitly approves a new assessment and expiry in a reviewed PR. Do not extend the date automatically, raise the severity threshold, skip development dependencies, or convert audit errors into success.
