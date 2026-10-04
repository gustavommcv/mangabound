import type { NetworkInterfaceInfo } from 'node:os';

import { describe, expect, it } from 'vitest';

import { OsNetworkInterfaces } from '@/adapters/network/os-network-interfaces';

function ipv4(address: string, internal: boolean): NetworkInterfaceInfo {
  return {
    address,
    netmask: '255.255.255.0',
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal,
    cidr: `${address}/24`,
  };
}

function ipv6(address: string, internal: boolean): NetworkInterfaceInfo {
  return {
    address,
    netmask: 'ffff:ffff:ffff:ffff::',
    family: 'IPv6',
    mac: '00:00:00:00:00:00',
    internal,
    cidr: `${address}/64`,
    scopeid: 0,
  };
}

describe('OsNetworkInterfaces', () => {
  it('returns only non-internal IPv4 addresses, excluding loopback and IPv6', () => {
    const list = new OsNetworkInterfaces(() => ({
      lo: [ipv4('127.0.0.1', true)],
      eth0: [ipv4('192.168.1.20', false), ipv6('fe80::1', false)],
    })).list();

    expect(list).toEqual([{ name: 'eth0', address: '192.168.1.20' }]);
  });

  it('includes every valid address on a single interface', () => {
    const list = new OsNetworkInterfaces(() => ({
      eth0: [ipv4('192.168.1.20', false), ipv4('192.168.1.21', false)],
    })).list();

    expect(list).toEqual([
      { name: 'eth0', address: '192.168.1.20' },
      { name: 'eth0', address: '192.168.1.21' },
    ]);
  });

  it('skips an interface entry with no addresses', () => {
    const list = new OsNetworkInterfaces(() => ({
      eth0: [ipv4('192.168.1.20', false)],
      ghost: undefined,
    })).list();

    expect(list).toEqual([{ name: 'eth0', address: '192.168.1.20' }]);
  });

  it('returns an empty list when there are no interfaces', () => {
    expect(new OsNetworkInterfaces(() => ({})).list()).toEqual([]);
  });

  describe('canShareOn', () => {
    const interfaces = new OsNetworkInterfaces(() => ({
      lo: [ipv4('127.0.0.1', true), ipv6('::1', true)],
      eth0: [ipv4('192.168.1.20', false), ipv6('fe80::1', false)],
      docker0: [ipv4('172.17.0.1', false)],
    }));

    it('accepts an address the list offers', () => {
      expect(interfaces.canShareOn('192.168.1.20')).toBe(true);
      expect(interfaces.canShareOn('172.17.0.1')).toBe(true);
    });

    it('accepts the loopback address, which no other device can reach', () => {
      expect(interfaces.canShareOn('127.0.0.1')).toBe(true);
    });

    it.each(['0.0.0.0', '::', '::1', 'localhost', 'example.com', '192.168.1.21', 'fe80::1', ''])(
      'refuses %j, which is not an address this device offers',
      (address) => {
        expect(interfaces.canShareOn(address)).toBe(false);
      },
    );

    it('refuses an address that was offered once and is gone', () => {
      let present = true;
      const changing = new OsNetworkInterfaces(() => ({
        eth0: present ? [ipv4('192.168.1.20', false)] : [],
      }));
      expect(changing.canShareOn('192.168.1.20')).toBe(true);
      present = false;
      expect(changing.canShareOn('192.168.1.20')).toBe(false);
    });
  });

  it('uses the real os.networkInterfaces by default', () => {
    expect(() => new OsNetworkInterfaces().list()).not.toThrow();
  });
});
