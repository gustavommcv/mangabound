/**
 * The version of a macOS app bundle, for its Info.plist.
 *
 * Apple documents CFBundleShortVersionString and CFBundleVersion as period-separated integers, and
 * a SemVer prerelease such as `0.1.0-alpha.11` is not one. The app's own `package.json` keeps the
 * full version, because that is what `app.getVersion()` reads and the title bar shows.
 */

/** The leading integers of a SemVer version: `0.1.0` for `0.1.0-alpha.11` and for `0.1.0+build`. */
export function bundleVersionOf(version: string): string {
  const numeric = /^\d+(?:\.\d+)*/u.exec(version)?.[0];
  if (numeric === undefined) {
    throw new Error(`"${version}" does not start with a version number.`);
  }
  return numeric;
}

const bundleVersionKeys = ['CFBundleShortVersionString', 'CFBundleVersion'] as const;

/**
 * The Info.plist text with both bundle version values set. Everything else is left as it is, and a
 * plist that lacks either key is refused, not guessed at: the packager that writes it changes
 * between versions, and a silent miss would put the wrong version in the bundle.
 */
export function withBundleVersion(plist: string, bundleVersion: string): string {
  let result = plist;
  for (const key of bundleVersionKeys) {
    const entry = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`, 'u');
    if (!entry.test(result)) throw new Error(`The Info.plist has no ${key}.`);
    result = result.replace(
      entry,
      (_match, open: string, close: string) => `${open}${bundleVersion}${close}`,
    );
  }
  return result;
}
