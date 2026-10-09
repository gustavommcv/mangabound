import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { fetchReleaseDownloads, resolveReleaseDownloads } from '../../src/release-downloads.mjs';

// Public metadata recorded from the shipped alpha.12 assets; no installer payloads are fixtures.
const recorded = JSON.parse(
  await readFile(new URL('../fixtures/release-alpha12.json', import.meta.url), 'utf8'),
);
const repository = 'https://github.com/gustavommcv/mangabound';
const filenames = {
  windowsInstaller: 'Mangabound-0.1.0-alpha.12.Setup.exe',
  windowsPortable: 'Mangabound-win32-x64-0.1.0-alpha.12.zip',
  macOS: 'Mangabound-darwin-arm64-0.1.0-alpha.12.zip',
  debian: 'mangabound_0.1.0.alpha.12_amd64.deb',
  fedora: 'mangabound-0.1.0.alpha.12-1.x86_64.rpm',
  arch: 'mangabound-0.1.0_alpha.12-1-x86_64.pkg.tar.zst',
  checksums: 'SHA256SUMS',
};

function release(overrides = {}) {
  return { ...structuredClone(recorded), ...overrides };
}

test('published package names, including Linux version normalization, determine the links', () => {
  const downloads = resolveReleaseDownloads([release()]);
  assert.equal(downloads.tag, recorded.tag_name);
  assert.equal(downloads.prerelease, true);
  assert.equal(downloads.notes, recorded.html_url);
  assert.deepEqual(
    downloads.assets,
    Object.fromEntries(
      Object.entries(filenames).map(([kind, filename]) => [
        kind,
        `${repository}/releases/download/v0.1.0-alpha.12/${filename}`,
      ]),
    ),
  );
});

test('the newest publication wins, not array order, tag version, or stable status', () => {
  const future = release({
    tag_name: 'v2.0.0-beta.1',
    html_url: `${repository}/releases/tag/v2.0.0-beta.1`,
    published_at: '2026-10-09T20:00:00Z',
  });
  for (const asset of future.assets) {
    asset.browser_download_url = asset.browser_download_url.replace(
      recorded.tag_name,
      future.tag_name,
    );
  }
  const releases = [
    release({ prerelease: false, published_at: '2026-10-07T20:00:00Z' }),
    future,
    release(),
    release({ draft: true, published_at: '2026-10-10T20:00:00Z' }),
    release({ published_at: null }),
    release({ assets: [], published_at: '2026-10-11T20:00:00Z' }),
  ];
  const before = structuredClone(releases);
  const downloads = resolveReleaseDownloads(releases);
  assert.equal(downloads.tag, future.tag_name);
  assert.equal(downloads.prerelease, true);
  assert.equal(downloads.assets.windowsPortable, future.assets[4].browser_download_url);
  assert.deepEqual(releases, before, 'selection must not reorder or rewrite the API response');
});

test('a stable publication keeps its stable status', () => {
  assert.equal(resolveReleaseDownloads([release({ prerelease: false })]).prerelease, false);
});

test('non-list metadata and an empty downloadable set fail instead of guessing a version', () => {
  assert.throws(() => resolveReleaseDownloads({ message: 'Not Found' }), /release list/);
  assert.throws(() => resolveReleaseDownloads([]), /No downloadable/);
  assert.throws(
    () => resolveReleaseDownloads([release({ draft: true }), release({ assets: [] })]),
    /No downloadable/,
  );
});

test('invalid publication dates and unrelated release notes cannot produce a download page', () => {
  assert.throws(
    () => resolveReleaseDownloads([release({ published_at: 'not a date' })]),
    /Invalid publication date/,
  );
  assert.throws(
    () => resolveReleaseDownloads([release({ html_url: 'https://example.org/release' })]),
    /release notes do not belong/,
  );
});

for (const [kind, filename] of Object.entries(filenames)) {
  test(`a missing or ambiguous ${kind} is not replaced by a constructed filename`, () => {
    const missing = release();
    missing.assets = missing.assets.filter((asset) => asset.name !== filename);
    assert.throws(() => resolveReleaseDownloads([missing]), new RegExp(`exactly one ${kind}`));
    const duplicate = release();
    duplicate.assets.push(
      structuredClone(duplicate.assets.find((asset) => asset.name === filename)),
    );
    assert.throws(() => resolveReleaseDownloads([duplicate]), new RegExp(`exactly one ${kind}`));
  });
}

for (const [filename, replacement] of [
  [filenames.windowsPortable, 'Mangabound-win32-arm64-0.1.0-alpha.12.zip'],
  [filenames.macOS, 'Mangabound-darwin-x64-0.1.0-alpha.12.zip'],
  [filenames.debian, 'mangabound_0.1.0.alpha.12_arm64.deb'],
  [filenames.fedora, 'mangabound-0.1.0.alpha.12-1.aarch64.rpm'],
  [filenames.arch, 'mangabound-0.1.0_alpha.12-1-aarch64.pkg.tar.zst'],
]) {
  test(`an unsupported architecture (${replacement}) cannot fill a supported package slot`, () => {
    const wrong = release();
    wrong.assets.find((asset) => asset.name === filename).name = replacement;
    assert.throws(() => resolveReleaseDownloads([wrong]), /exactly one/);
  });
}

test('an upload still in progress cannot become a download button', () => {
  const incomplete = release();
  incomplete.assets[0].state = 'new';
  assert.throws(() => resolveReleaseDownloads([incomplete]), /not an uploaded asset/);
});

for (const url of [
  'https://example.org/installer.exe',
  `${repository}/releases/download/v0.1.0-alpha.11/${filenames.windowsInstaller}`,
  `${repository}/releases/download/v0.1.0-alpha.12/another.exe`,
]) {
  test(`the installer link must belong to the selected release and uploaded filename: ${url}`, () => {
    const wrong = release();
    wrong.assets[0].browser_download_url = url;
    assert.throws(() => resolveReleaseDownloads([wrong]), /not an uploaded asset/);
  });
}

test('unrelated updater and source archives do not become user-facing packages', () => {
  const extra = release();
  for (const name of ['RELEASES', 'Mangabound.nupkg', 'Source-code.zip']) {
    extra.assets.push({ name, state: 'uploaded', browser_download_url: 'https://example.org/' });
  }
  assert.deepEqual(resolveReleaseDownloads([extra]), resolveReleaseDownloads([release()]));
});

test('the default request fetches public release metadata without authentication', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/gustavommcv/mangabound/releases?per_page=100');
    assert.equal(options.headers.Accept, 'application/vnd.github+json');
    assert.equal(options.headers['X-GitHub-Api-Version'], '2026-03-10');
    assert.equal(options.headers.Authorization, undefined);
    return Response.json([release()]);
  });
  assert.deepEqual(await fetchReleaseDownloads(), resolveReleaseDownloads([release()]));
});

test('optional CI authentication stays on the metadata request and out of the result', async () => {
  const token = 'test-only-read-token';
  const downloads = await fetchReleaseDownloads(async (_url, options) => {
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    return Response.json([release()]);
  }, token);
  assert.deepEqual(downloads, resolveReleaseDownloads([release()]));
  assert.equal(JSON.stringify(downloads).includes(token), false);
});

for (const status of [403, 500]) {
  test(`GitHub HTTP ${status} does not become guessed or stale download metadata`, async () => {
    await assert.rejects(
      fetchReleaseDownloads(
        async () => new Response('untrusted error body', { status }),
        'private',
      ),
      new RegExp(`HTTP ${status}`),
    );
  });
}

test('invalid JSON and network failures prevent generating download links', async () => {
  await assert.rejects(
    fetchReleaseDownloads(async () => new Response('not JSON')),
    SyntaxError,
  );
  const failure = new Error('network unavailable');
  await assert.rejects(
    fetchReleaseDownloads(async () => {
      throw failure;
    }),
    (error) => error === failure,
  );
});
