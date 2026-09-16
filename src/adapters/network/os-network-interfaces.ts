import { networkInterfaces } from 'node:os';

import type {
  NetworkInterfaceOption,
  NetworkInterfacePort,
} from '@/application/ports/network-interfaces';

export class OsNetworkInterfaces implements NetworkInterfacePort {
  constructor(private readonly listInterfaces: typeof networkInterfaces = networkInterfaces) {}

  list(): readonly NetworkInterfaceOption[] {
    const options: NetworkInterfaceOption[] = [];
    for (const [name, addresses] of Object.entries(this.listInterfaces())) {
      if (addresses === undefined) continue;
      for (const address of addresses) {
        if (address.internal || address.family !== 'IPv4') continue;
        options.push({ name, address: address.address });
      }
    }
    return options;
  }
}
