export function encodeRelativePath(relativePath: string): string {
  return relativePath.split('/').map(encodeURIComponent).join('/');
}

export function withToken(href: string, token: string | undefined): string {
  if (token === undefined) return href;
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}token=${encodeURIComponent(token)}`;
}
