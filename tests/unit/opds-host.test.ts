import { describe, expect, it } from 'vitest';

import { isOwnHost } from '@/opds/host';

const names = ['my-pc', 'my-pc.local'];

describe('which Host headers name this computer', () => {
  it.each([
    '192.168.1.5',
    '192.168.1.5:48123',
    '127.0.0.1:48123',
    '[::1]:48123',
    '[::1]',
    '[fe80::1]',
    '[2001:db8::1]:80',
    // Case and spaces do not make another address.
    ' 192.168.1.5:48123 ',
  ])('takes the address in numbers %j', (header) => {
    expect(isOwnHost(header, names)).toBe(true);
  });

  it.each(['localhost', 'localhost:48123', 'LOCALHOST:1', 'localhost.'])(
    'takes localhost, %j',
    (header) => {
      expect(isOwnHost(header, names)).toBe(true);
    },
  );

  it.each(['my-pc', 'my-pc:48123', 'MY-PC', 'my-pc.local:48123', 'my-pc.local.'])(
    'takes the name of the computer itself, %j',
    (header) => {
      expect(isOwnHost(header, names)).toBe(true);
    },
  );

  it.each([
    'evil.example',
    'evil.example:48123',
    // A name that only ends or begins like one that is allowed.
    'my-pc.evil.example',
    'evil-my-pc',
    'localhost.evil.example',
    // Looks like an address and is a name, which a page can make point anywhere.
    '192.168.1.5.evil.example',
    '1.2.3',
    '999.1.1.1',
  ])('refuses the name %j', (header) => {
    expect(isOwnHost(header, names)).toBe(false);
  });

  it.each([
    '',
    '   ',
    ':48123',
    '[::1',
    '[::1]x',
    '[::1]:x',
    'my-pc:port',
    'localhost:',
    '.',
    '[]',
  ])('refuses what is not written as a host, %j', (header) => {
    // `localhost:` has no port at all after the colon, which is a host and a port of no digits:
    // an empty port is allowed, as the standard writes it.
    expect(isOwnHost(header, names)).toBe(header === 'localhost:');
  });

  it('takes a request that has no Host at all, which no browser sends', () => {
    expect(isOwnHost(undefined, names)).toBe(true);
  });

  it('takes no name but the ones it is given', () => {
    expect(isOwnHost('my-pc', [])).toBe(false);
    expect(isOwnHost('localhost', [])).toBe(true);
    expect(isOwnHost('10.0.0.1', [])).toBe(true);
  });
});
