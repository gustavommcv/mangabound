import { describe, expect, it } from 'vitest';

import { resolveNetworkInterface } from '@/renderer/lib/sharing';

const interfaces = [
  { name: 'Radmin VPN', address: '26.97.251.250' },
  { name: 'Ethernet', address: '192.168.18.39' },
];

describe('resolveNetworkInterface', () => {
  it('uses the first interface until someone chooses another', () => {
    expect(resolveNetworkInterface(interfaces, undefined)).toEqual(interfaces[0]);
    expect(resolveNetworkInterface([], undefined)).toBeUndefined();
  });

  it('keeps the exact interface when it is still available', () => {
    expect(resolveNetworkInterface(interfaces, interfaces[1])).toEqual(interfaces[1]);
  });

  it('keeps the exact address of an adapter that has two', () => {
    const twoAddresses = [
      { name: 'Ethernet', address: '192.168.18.39' },
      { name: 'Ethernet', address: '192.168.18.40' },
    ];

    expect(resolveNetworkInterface(twoAddresses, twoAddresses[1])).toEqual(twoAddresses[1]);
  });

  it('keeps the adapter when DHCP changes its address', () => {
    expect(
      resolveNetworkInterface(interfaces, { name: 'Ethernet', address: '192.168.18.12' }),
    ).toEqual(interfaces[1]);
  });

  it('temporarily falls back when the adapter is gone', () => {
    expect(resolveNetworkInterface(interfaces, { name: 'Wi-Fi', address: '10.0.0.3' })).toEqual(
      interfaces[0],
    );
    expect(resolveNetworkInterface([], { name: 'Wi-Fi', address: '10.0.0.3' })).toBeUndefined();
  });
});
