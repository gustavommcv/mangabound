import { MetadataProviderError } from './errors';

/**
 * Sent with every request. A service may insist on a real, identifiable user agent and forbid a
 * borrowed or generic one, so this says what the app is and where to find it.
 */
export const userAgent = 'Mangabound (+https://github.com/gustavommcv/mangabound)';

/**
 * Reads a service's answer as text. Every provider goes through this, so a service that cannot be
 * reached, that is rate-limiting or that answers with an error fails the same way in each of them.
 * The service name is only for the message shown to the person.
 */
export async function requestText(
  fetchImpl: typeof globalThis.fetch,
  request: { readonly url: string; readonly serviceName: string; readonly signal?: AbortSignal },
): Promise<string> {
  const { serviceName, signal, url } = request;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new MetadataProviderError('network_error', `Could not reach ${serviceName}.`, true, {
      cause: error,
    });
  }
  if (response.status === 429) {
    throw new MetadataProviderError(
      'rate_limited',
      `${serviceName} is rate-limiting requests. Try again shortly.`,
      true,
    );
  }
  if (!response.ok) {
    throw new MetadataProviderError(
      'http_error',
      `${serviceName} returned an unexpected status (${String(response.status)}).`,
      true,
    );
  }
  return response.text();
}
