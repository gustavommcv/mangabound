import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../../src/renderer/index.html', import.meta.url), 'utf8');

function policyOf(document: string): ReadonlyMap<string, readonly string[]> {
  const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/u.exec(document);
  if (meta === null) throw new Error('The page has no Content-Security-Policy.');
  const directives = new Map<string, readonly string[]>();
  for (const directive of (meta[1] ?? '').split(';')) {
    const [name, ...sources] = directive.trim().split(/\s+/u);
    if (name !== undefined && name !== '') directives.set(name, sources);
  }
  return directives;
}

describe("the page's Content-Security-Policy", () => {
  const policy = policyOf(html);

  it('starts from nothing but the page itself', () => {
    expect(policy.get('default-src')).toEqual(["'self'"]);
  });

  it('lets scripts come only from the page itself', () => {
    expect(policy.get('script-src')).toEqual(["'self'"]);
  });

  it('lets the page talk to nowhere but where it came from', () => {
    // A WebSocket to any host is a way to send out whatever the page can read. The development
    // server's own socket is the same origin as its page, which 'self' already covers.
    expect(policy.get('connect-src')).toEqual(["'self'"]);
  });

  it('never names a source that reaches any host', () => {
    for (const [directive, sources] of policy) {
      for (const source of sources) {
        expect(
          ['*', 'http:', 'https:', 'ws:', 'wss:', 'file:', 'blob:'],
          `${directive} allows ${source}`,
        ).not.toContain(source);
      }
    }
  });

  it('fails loudly when the page carries no policy at all', () => {
    expect(() => policyOf('<html></html>')).toThrow('no Content-Security-Policy');
  });
});
