# Security policy

## Supported versions

Mangabound is in alpha. Security fixes target `main` and the latest published release; older alpha releases do not receive separate patches. Where possible, check whether the problem still occurs in the latest release before reporting it. Reports about development builds are also welcome: include the commit SHA.

## Report a vulnerability privately

Use GitHub's [private vulnerability reporting form](https://github.com/gustavommcv/mangabound/security/advisories/new). You can also find it under **Security → Report a vulnerability** in this repository. Reports go to the repository maintainers, not to a public issue.

Do not disclose a suspected vulnerability in a public issue, pull request, or discussion. Include:

- The Mangabound version or commit, operating system, and installation type.
- Steps to reproduce the problem and its security impact.
- The affected component, if known: the desktop app, local sharing, a bundled tool, or the documentation site.
- A minimal proof of concept or redacted diagnostic output, if available.

Do not include passwords, tokens, personal paths, or manga archives. Use a small sample that you are allowed to share if a file is needed to reproduce the problem.

Maintainers will assess the report and coordinate a fix and disclosure with you through the private advisory. This is a volunteer-maintained project; no fixed response or remediation deadline is promised. Please keep technical details private while that coordination is in progress.

## Bundled tools and dependencies

If the problem is in mangabind or mangapress, identify the tool and version in the report. Maintainers can coordinate with the relevant upstream project; the tools' versions are pinned in `toolchain.lock.json`.

The website's dependency-audit records and exception policy live in [website/SECURITY.md](website/SECURITY.md). That document does not replace this private reporting channel.

For ordinary bugs and feature requests, use the [issue templates](https://github.com/gustavommcv/mangabound/issues/new/choose) instead.
