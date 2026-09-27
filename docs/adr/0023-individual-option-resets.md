# ADR 0023: Changed options have individual resets

- Status: Accepted
- Date: 2026-09-26
- Amends: [ADR 0014](0014-persisted-settings-and-reset.md) (the all-options reset remains, and each changed option can now be restored separately)

## Context

The queue and the mangapress options screen offered a reset for all options, but restoring one accidental change required discarding the others or remembering its starting value. The options screen includes dependent controls and device-specific upscaling defaults, so a per-field reset must use the same rules as an ordinary device change.

## Decision

- Mark each option whose value differs from its default with the existing accent color and a labeled restore action beside its label. Show the action only for a changed option. Keep the all-options reset and its confirmation unchanged.
- For mangapress fields, restore just the selected field. Restoring the device profile also restores the device's starting upscaling value, as choosing a device already does. Upscaling itself is compared with the currently selected device's starting value. Optional numbers and the current book's title and author restore to empty.
- On the queue, offer individual restores for the device, format, and a process step that the current input can actually display. A CBZ or library can force a different effective mode; that forced display is not treated as a user modification.
- Keep the action available when a changed setting's input is temporarily disabled by another choice. After activation, move focus to the setting's control when it can receive focus, or to its heading otherwise.

## Consequences

A person can undo a single change without losing other choices. The color is supplemented by an accessible button label, so the state is not conveyed by color alone. Restoring a custom dimension while the `OTHER` profile is selected can make that profile incomplete; the existing inline validation explains the missing dimension and prevents saving or running until it is supplied or another profile is selected.
