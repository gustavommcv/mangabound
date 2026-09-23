// Fixed rather than OS-assigned, so a catalog added once in KOReader keeps working across
// restarts instead of needing to be re-added every time the port happens to change (ADR 0019).
// Picked in the private/dynamic range, away from common dev-server ports (3000, 5173, 8080, ...).
export const opdsPort = 48123;

// How long to wait for the renderer's 'ready-to-show' signal before showing the window anyway.
// That signal depends on a first composited frame, which some GPU/display setups (observed with a
// virtual display adapter alongside a real GPU) never deliver, leaving the window created but never
// shown with no error anywhere.
export const readyToShowFallbackMs = 10_000;
