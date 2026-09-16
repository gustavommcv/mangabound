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
});
