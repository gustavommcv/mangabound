const repository = 'https://github.com/gustavommcv/mangabound';
const api = 'https://api.github.com/repos/gustavommcv/mangabound/releases?per_page=100';

const packages = {
  windowsInstaller: /^Mangabound-.+\.Setup\.exe$/,
  windowsPortable: /^Mangabound-win32-x64-.+\.zip$/,
  macOS: /^Mangabound-darwin-arm64-.+\.zip$/,
  debian: /^mangabound_.+_amd64\.deb$/,
  fedora: /^mangabound-.+\.x86_64\.rpm$/,
  arch: /^mangabound-.+-x86_64\.pkg\.tar\.zst$/,
  checksums: /^SHA256SUMS$/,
};

/**
 * @typedef {{ name: string, state: string, browser_download_url: string }} Asset
 * @typedef {{ tag_name: string, html_url: string, draft: boolean, prerelease: boolean,
 *   published_at: string | null, assets: Asset[] }} Release
 */

/**
 * Select actual uploaded assets, not filenames inferred from the development version.
 * Releases with no remaining assets are not downloadable (for example, withdrawn releases).
 *
 * @param {Release[]} releases
 */
export function resolveReleaseDownloads(releases) {
  if (!Array.isArray(releases)) throw new Error('GitHub did not return a release list.');
  const published = releases.filter(
    (release) => !release.draft && release.published_at && release.assets.length > 0,
  );
  for (const release of published) {
    if (!Number.isFinite(Date.parse(release.published_at))) {
      throw new Error(`Invalid publication date for ${release.tag_name}.`);
    }
  }
  published.sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  const release = published[0];
  if (!release) throw new Error('No downloadable Mangabound release has been published.');

  const tag = encodeURIComponent(release.tag_name);
  if (release.html_url !== `${repository}/releases/tag/${tag}`) {
    throw new Error('The release notes do not belong to the Mangabound repository.');
  }

  const assets = Object.fromEntries(
    Object.entries(packages).map(([name, pattern]) => {
      const matches = release.assets.filter((asset) => pattern.test(asset.name));
      if (matches.length !== 1) {
        throw new Error(`${release.tag_name} must have exactly one ${name} download.`);
      }
      const asset = matches[0];
      const expected = `${repository}/releases/download/${tag}/${encodeURIComponent(asset.name)}`;
      if (asset.state !== 'uploaded' || asset.browser_download_url !== expected) {
        throw new Error(`${name} is not an uploaded asset of ${release.tag_name}.`);
      }
      return [name, asset.browser_download_url];
    }),
  );
  return { tag: release.tag_name, prerelease: release.prerelease, notes: release.html_url, assets };
}

/** Fetch once at build/server startup; never send the token or request code to a visitor. */
export async function fetchReleaseDownloads(request = fetch, token = '') {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
    'User-Agent': 'mangabound-website',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const response = await request(api, { headers });
  if (!response.ok) {
    throw new Error(`Could not read Mangabound releases from GitHub (HTTP ${response.status}).`);
  }
  return resolveReleaseDownloads(await response.json());
}
