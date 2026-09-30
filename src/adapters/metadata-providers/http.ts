import { MetadataProviderError } from './errors';

/**
 * Sent with every request. A service may insist on a real, identifiable user agent and forbid a
 * borrowed or generic one, so this says what the app is and where to find it.
 */
export const userAgent = 'Mangabound (+https://github.com/gustavommcv/mangabound)';

/**
 * How long a service has to answer before the request is given up. These are public catalogues that
 * answer in a second or two, and a person is waiting on the screen, so a service that says nothing
 * for this long is reported as not answering rather than waited for.
 */
export const requestTimeoutMs = 15_000;

/**
 * Reads a service's answer as text. Every provider goes through this, so a service that cannot be
 * reached, that does not answer in time, that is rate-limiting or that answers with an error fails
 * the same way in each of them. The service name is only for the message shown to the person.
 */
export async function requestText(
  fetchImpl: typeof globalThis.fetch,
  request: {
    readonly url: string;
    readonly serviceName: string;
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
  },
): Promise<string> {
  const { serviceName, signal, timeoutMs = requestTimeoutMs, url } = request;
  // The whole exchange, the answer's body included, stops at the timeout or when the caller cancels.
  const timeout = AbortSignal.timeout(timeoutMs);
  const stop = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  const failure = (error: unknown): unknown => {
    if (timeout.aborted && signal?.aborted !== true) {
      return new MetadataProviderError(
        'timeout',
        `${serviceName} did not answer in time. Try again shortly.`,
        true,
        { cause: error },
      );
    }
    if (error instanceof Error && error.name === 'AbortError') return error;
    return new MetadataProviderError('network_error', `Could not reach ${serviceName}.`, true, {
      cause: error,
    });
  };

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: stop,
    });
  } catch (error) {
    throw failure(error);
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
  try {
    return await response.text();
  } catch (error) {
    throw failure(error);
  }
}
