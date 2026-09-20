export type MetadataProviderErrorCode =
  'malformed_json' | 'invalid_payload' | 'http_error' | 'rate_limited' | 'network_error';

/**
 * What a provider throws when its service cannot be used right now. The message is written for the
 * person looking at the screen and names the service, so the same failure reads clearly whichever
 * source it came from.
 */
export class MetadataProviderError extends Error {
  constructor(
    readonly code: MetadataProviderErrorCode,
    message: string,
    readonly recoverable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MetadataProviderError';
  }
}
