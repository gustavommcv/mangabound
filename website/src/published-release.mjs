import { fetchReleaseDownloads } from './release-downloads.mjs';

// Module caching gives all platforms and languages the same release within this build/server.
export const publishedRelease = fetchReleaseDownloads(fetch, process.env.GITHUB_TOKEN);
