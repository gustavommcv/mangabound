// Fixed rather than OS-assigned, so a catalog added once in KOReader keeps working across
// restarts instead of needing to be re-added every time the port happens to change (ADR 0019).
// Picked in the private/dynamic range, away from common dev-server ports (3000, 5173, 8080, ...).
export const opdsPort = 48123;
