// Fixed rather than OS-assigned, so a catalog added once in KOReader keeps working across
// restarts instead of needing to be re-added every time the port happens to change (ADR 0019).
// Picked in the private/dynamic range, away from common dev-server ports (3000, 5173, 8080, ...).
export const opdsPort = 48123;

// How long to wait for the renderer's 'ready-to-show' signal before showing the window anyway. See
// the comment in window.ts: this is a safety net for a signal that has a confirmed Electron bug in
// our past version range and, even patched, is documented to sometimes arrive later than expected.
export const readyToShowFallbackMs = 10_000;
