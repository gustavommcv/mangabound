import net from 'node:net';

/**
 * The name or address in a `Host` header, without its port, or `undefined` for one that is not
 * written as a host (an empty one, an unclosed bracket, a port that is not a number).
 */
function hostOf(header: string): string | undefined {
  const text = header.trim().toLowerCase();
  let host: string;
  let port: string;
  if (text.startsWith('[')) {
    const end = text.indexOf(']');
    if (end === -1) return undefined;
    host = text.slice(1, end);
    port = text.slice(end + 1);
    if (port !== '' && !port.startsWith(':')) return undefined;
    port = port.slice(1);
  } else {
    const colon = text.lastIndexOf(':');
    host = colon === -1 ? text : text.slice(0, colon);
    port = colon === -1 ? '' : text.slice(colon + 1);
  }
  if (!/^\d*$/u.test(port)) return undefined;
  const withoutDot = host.endsWith('.') ? host.slice(0, -1) : host;
  return withoutDot === '' ? undefined : withoutDot;
}

/**
 * Whether a request names this computer in its `Host` header. A web page that has made its own
 * name point at an address on the person's network (DNS rebinding) reaches the server with that
 * name in `Host`, and the browser then lets the page read what comes back; so a share with no
 * password could be read by any page the person visits. An address in numbers can only be what it
 * says, and `localhost` and the computer's own names are what a person types for a computer they
 * own. Any other name is refused. A request with no `Host` at all (an old HTTP/1.0 client) is not
 * a browser's, which always sends one, and is let through.
 */
export function isOwnHost(header: string | undefined, ownNames: readonly string[]): boolean {
  if (header === undefined) return true;
  const host = hostOf(header);
  if (host === undefined) return false;
  return net.isIP(host) !== 0 || host === 'localhost' || ownNames.includes(host);
}
