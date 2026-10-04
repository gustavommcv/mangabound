/**
 * The only permissions the page is given. The app asks for no camera, microphone, location,
 * notifications or device access, and a page that got hold of code it should not run must not be
 * able to switch any of them on: Electron grants every request unless told otherwise. Writing
 * to the clipboard stays, since the Share panel's Copy button needs it.
 */
const grantedPermissions: ReadonlySet<string> = new Set(['clipboard-sanitized-write']);

export function isPermissionGranted(permission: string): boolean {
  return grantedPermissions.has(permission);
}
