/** Reject changes to the conditions assessed for the temporary exception in SECURITY.md. */
export function assertAuditScope(config, lock) {
  if (
    config === null ||
    typeof config !== 'object' ||
    (config.output !== undefined && config.output !== 'static') ||
    config.adapter !== undefined
  ) {
    throw new Error('The documentation audit exception requires a static site without an adapter.');
  }

  for (const [name, version] of Object.entries({
    astro: '7.3.5',
    'http-cache-semantics': '4.2.0',
  })) {
    const copies = Object.entries(lock.packages).filter(([path]) =>
      path.endsWith(`node_modules/${name}`),
    );
    if (
      copies.length !== 1 ||
      copies[0][0] !== `node_modules/${name}` ||
      copies[0][1].version !== version
    ) {
      throw new Error(
        `Review or remove the documentation audit exception before changing ${name}@${version}. See SECURITY.md.`,
      );
    }
  }
}
