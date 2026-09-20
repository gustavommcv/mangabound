import type { OpdsSharingStatus } from '@/shared/opds-contract';

/**
 * The address to give an OPDS reader while sharing is on. When the catalog is protected by a token
 * the token is part of it, so one paste is all the reader needs. Undefined while nothing is shared.
 */
export function catalogAddress(status: OpdsSharingStatus): string | undefined {
  if (!status.active || status.url === undefined) return undefined;
  return status.authMode === 'token' && status.token !== undefined
    ? `${status.url}/?token=${status.token}`
    : status.url;
}
