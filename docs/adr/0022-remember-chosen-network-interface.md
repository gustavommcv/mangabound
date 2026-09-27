# ADR 0022: Remember the chosen network interface for sharing

- Status: Accepted
- Date: 2026-09-26
- Amends: [ADR 0014](0014-persisted-settings-and-reset.md) (the sharing server still stops on exit, but the selected interface is now a preference)

## Context

The Share panel previously selected the first network interface each time it opened. On a machine with a VPN adapter listed before Ethernet, a person had to change that choice every time. Saving only the IP address would also lose the choice when DHCP assigned Ethernet a new address.

## Decision

- Save the explicitly chosen interface's operating-system name and current IPv4 address in the existing per-user `settings.json`. Do not write a default choice merely because the panel was opened.
- On each launch, prefer an exact name/address match, then another current address under the same name, then the first available interface. If the named interface is temporarily absent, keep the saved preference so it can be selected again when it returns.
- Keep the selected interface in the renderer while the Share panel is closed. A selection is saved when it changes, whether or not sharing is started. The main process carries it through unrelated settings saves, including a remembered file-picker folder.
- Starting the OPDS server remains a separate, explicit action. Credentials and an active server are not restored at launch.

## Consequences

The interface selection survives closing the panel and restarting Mangabound, including an ordinary DHCP address change. A renamed or removed adapter falls back to the first available one without discarding the stored choice. Adapter names are supplied by the operating system, so a rename cannot be recognized as the same adapter automatically.
