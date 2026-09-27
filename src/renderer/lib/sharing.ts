import type { NetworkInterfaceOption, OpdsSharingStatus } from '@/shared/opds-contract';

/** Keep the same adapter across DHCP changes; never replace a saved choice just because it is away. */
export function resolveNetworkInterface(
  interfaces: readonly NetworkInterfaceOption[],
  preferred: NetworkInterfaceOption | undefined,
): NetworkInterfaceOption | undefined {
  if (preferred === undefined) return interfaces[0];
  return (
    interfaces.find(
      (option) => option.name === preferred.name && option.address === preferred.address,
    ) ??
    interfaces.find((option) => option.name === preferred.name) ??
    interfaces[0]
  );
}

/**
 * The address to give an OPDS reader while sharing is on: short enough to type by hand, since any
 * credentials go in the reader's own username/password fields, not the address (ADR 0018).
 * Undefined while nothing is shared.
 */
export function catalogAddress(status: OpdsSharingStatus): string | undefined {
  return status.active ? status.url : undefined;
}
