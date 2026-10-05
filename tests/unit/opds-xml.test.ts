import { describe, expect, it } from 'vitest';

import { escapeXml } from '@/opds/xml';

describe('escapeXml', () => {
  it('escapes each reserved character', () => {
    expect(escapeXml('&')).toBe('&amp;');
    expect(escapeXml('<')).toBe('&lt;');
    expect(escapeXml('>')).toBe('&gt;');
    expect(escapeXml('"')).toBe('&quot;');
    expect(escapeXml("'")).toBe('&apos;');
  });

  it('escapes a combination of reserved characters within text', () => {
    expect(escapeXml(`Tom & Jerry: "Cat's Life" <redux>`)).toBe(
      'Tom &amp; Jerry: &quot;Cat&apos;s Life&quot; &lt;redux&gt;',
    );
  });

  it('leaves already-safe text and unicode untouched', () => {
    expect(escapeXml('A Quiet Journey 静かな旅')).toBe('A Quiet Journey 静かな旅');
  });

  it('turns a control character, which XML does not allow even escaped, into a space', () => {
    expect(escapeXml('Vol\u0007.01\u0000 \u001Fend')).toBe('Vol .01   end');
    expect(escapeXml('a\u000Bb\u000Cc\u000Ed')).toBe('a b c d');
    // The second block of control characters is allowed in XML but is not text either.
    expect(escapeXml('a\u007Fb\u0085c\u009Fd')).toBe('a b c d');
  });

  it('keeps the tab, the line feed and the carriage return, which are allowed', () => {
    expect(escapeXml('a\tb\nc\rd')).toBe('a\tb\nc\rd');
  });

  it('replaces what XML cannot carry at all, and keeps a pair of surrogates whole', () => {
    expect(escapeXml('a￾b￿c')).toBe('a�b�c');
    // Half of a pair: at the end, before a letter, and after one.
    expect(escapeXml('a\uD800')).toBe('a�');
    expect(escapeXml('\uD800b')).toBe('�b');
    expect(escapeXml('a\uDC00')).toBe('a�');
    expect(escapeXml('\uDC00\uD800')).toBe('��');
    // A character outside the basic plane is two of them, together.
    expect(escapeXml('Vol 😀')).toBe('Vol 😀');
  });

  it('cleans and escapes in the same text', () => {
    expect(escapeXml('<a\u0001&b>')).toBe('&lt;a &amp;b&gt;');
  });
});
