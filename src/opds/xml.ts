const xmlEscapes: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/**
 * What XML 1.0 does not allow in a document at all, escaped or not: the control characters other
 * than tab, line feed and carriage return, U+FFFE and U+FFFF, and a surrogate that has no partner.
 * One of them anywhere in a feed makes a strict reader refuse the whole feed. The control
 * characters of the second block (U+007F to U+009F) are allowed but are not text either, and go
 * the same way.
 */
const controlCharacters = /(?![\t\n\r])\p{Cc}/gu;
const notCharacters =
  /[￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/gu;

/**
 * Text for a feed, as it must be written inside an element or an attribute: the five characters
 * XML reserves are escaped, a control character becomes a space and a character XML cannot carry
 * becomes the replacement character. A title or a file name is whatever a person or an archive
 * called it, and one odd character must not cost the reader the whole catalog.
 */
export function escapeXml(text: string): string {
  return text
    .replace(controlCharacters, ' ')
    .replace(notCharacters, '\uFFFD')
    .replace(/[&<>"']/g, (char) => xmlEscapes[char]!);
}
