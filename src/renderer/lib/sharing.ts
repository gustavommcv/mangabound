import type { OpdsSharingStatus } from '@/shared/opds-contract';

/**
 * The address to give an OPDS reader while sharing is on: short enough to type by hand, since any
 * credentials go in the reader's own username/password fields, not the address (ADR 0018).
 * Undefined while nothing is shared.
 */
export function catalogAddress(status: OpdsSharingStatus): string | undefined {
  return status.active ? status.url : undefined;
}
