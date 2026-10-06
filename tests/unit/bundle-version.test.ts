import { describe, expect, it } from 'vitest';

import { bundleVersionOf, withBundleVersion } from '../../scripts/lib/bundle-version';

/** The shape @electron/packager writes: `plist.build` output, with the keys of one app bundle. */
const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>CFBundleName</key>
    <string>Mangabound</string>
    <key>CFBundleShortVersionString</key>
    <string>0.1.0-alpha.11</string>
    <key>CFBundleVersion</key>
    <string>0.1.0-alpha.11</string>
    <key>CFBundleExecutable</key>
    <string>mangabound</string>
  </dict>
</plist>`;

describe('the version of a macOS bundle', () => {
  it.each([
    ['0.1.0-alpha.11', '0.1.0'],
    ['0.1.0', '0.1.0'],
    ['1.2.3-rc.1+build.5', '1.2.3'],
    ['1.2.3+build.5', '1.2.3'],
    ['12', '12'],
    ['10.20.30.40-beta', '10.20.30.40'],
  ])('is the leading integers of %s: %s', (version, expected) => {
    expect(bundleVersionOf(version)).toBe(expected);
  });

  it.each(['', 'alpha.11', 'v0.1.0', '-1.0.0', '.1'])('is refused for %j', (version) => {
    expect(() => bundleVersionOf(version)).toThrow(/does not start with a version number/u);
  });
});

describe('setting it in an Info.plist', () => {
  it('sets both values and leaves every other byte of the file as it was', () => {
    const result = withBundleVersion(infoPlist, '0.1.0');

    expect(result).toBe(infoPlist.replaceAll('0.1.0-alpha.11', '0.1.0'));
    expect(result).toContain('<key>CFBundleShortVersionString</key>\n    <string>0.1.0</string>');
    expect(result).toContain('<key>CFBundleVersion</key>\n    <string>0.1.0</string>');
    expect(result).toContain('<string>Mangabound</string>');
  });

  it('does not take CFBundleVersion for the key it contains the name of, or the reverse', () => {
    const different = infoPlist
      .replace(
        '<key>CFBundleShortVersionString</key>\n    <string>0.1.0-alpha.11</string>',
        '<key>CFBundleShortVersionString</key>\n    <string>short</string>',
      )
      .replace(
        '<key>CFBundleVersion</key>\n    <string>0.1.0-alpha.11</string>',
        '<key>CFBundleVersion</key>\n    <string>build</string>',
      );

    const result = withBundleVersion(different, '2.0.0');

    expect(result).toContain('<key>CFBundleShortVersionString</key>\n    <string>2.0.0</string>');
    expect(result).toContain('<key>CFBundleVersion</key>\n    <string>2.0.0</string>');
    expect(result).not.toContain('short');
    expect(result).not.toContain('build');
  });

  it('reads a plist written on one line, or with other spacing, the same way', () => {
    const compact =
      '<dict><key>CFBundleShortVersionString</key><string>1.0.0-x</string><key>CFBundleVersion</key><string>1.0.0-x</string></dict>';

    expect(withBundleVersion(compact, '1.0.0')).toBe(
      '<dict><key>CFBundleShortVersionString</key><string>1.0.0</string><key>CFBundleVersion</key><string>1.0.0</string></dict>',
    );
  });

  it.each(['CFBundleShortVersionString', 'CFBundleVersion'])(
    'is refused, not guessed at, when %s is missing',
    (key) => {
      const without = infoPlist.replace(
        new RegExp(`<key>${key}</key>\\s*<string>[^<]*</string>\\s*`, 'u'),
        '',
      );

      expect(() => withBundleVersion(without, '0.1.0')).toThrow(`The Info.plist has no ${key}.`);
    },
  );

  it('writes the value as given, which a replacement pattern in it cannot change', () => {
    expect(withBundleVersion(infoPlist, '$&1.0')).toContain('<string>$&1.0</string>');
  });
});
