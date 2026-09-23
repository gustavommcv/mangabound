import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ADR 0001's module boundaries (docs/architecture.md's "Layers" table has the full "May import"
// list this encodes), enforced by resolving every import to the real file it targets before
// checking it - not by matching the text of the specifier. A `no-restricted-imports` pattern only
// ever sees the string in `from '...'`, so it cannot tell that `../../adapters/foo` and
// `@/adapters/foo` name the same file; this rule resolves both the same way `path.resolve` (a
// relative specifier) or the `@/*` alias (an aliased one) would, then compares the layer that
// resolves to against what the importing file's own layer may reach.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(repoRoot, 'src');

// undefined means "no restriction" - just `main`, the composition root ADR 0001 says may import
// everything below it. Every other key lists exactly the layers that layer's own files may import
// from; a file may always import another file in its own layer, so that layer is never listed
// here.
const allowedLayers = {
  domain: [],
  application: ['domain', 'library', 'opds'],
  adapters: ['domain', 'application', 'shared', 'library', 'opds'],
  library: ['domain', 'library', 'opds'],
  opds: ['domain', 'library', 'opds'],
  shared: ['domain'],
  preload: ['domain', 'shared'],
  renderer: ['domain', 'shared'],
  main: undefined,
};

// domain, application and shared keep ADR 0001's "no Electron, React, filesystem, process, or
// network imports" line; renderer is sandboxed and reaches Electron only through the preload
// bridge. library/opds forbid electron (never needed) but not Node builtins: that line names
// domain specifically, and both already use `node:path` for plain joining. adapters, main and
// preload legitimately use both and are left alone.
const forbidsElectron = new Set(['domain', 'application', 'library', 'opds', 'shared', 'renderer']);
const forbidsNodeBuiltins = new Set(['domain', 'application', 'shared', 'renderer']);

/** The top-level `src/<layer>` a real path falls under, or undefined outside `src` entirely. */
function layerOf(absolutePath) {
  const relative = path.relative(srcRoot, absolutePath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return undefined;
  return relative.split(path.sep)[0];
}

/** Where a specifier points, resolved the same way the alias or a relative import really would. */
function resolveSpecifier(specifier, fromFile) {
  if (specifier.startsWith('@/')) return path.join(srcRoot, specifier.slice(2));
  if (specifier.startsWith('.')) return path.resolve(path.dirname(fromFile), specifier);
  return undefined; // A bare specifier: an npm package, or handled by name below.
}

export const moduleBoundaries = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Enforces ADR 0001's module boundaries by resolving an import to its real target, so a relative path is caught exactly like the `@/*` alias would be.",
    },
    schema: [],
    messages: {
      layer: '{{from}} may not import {{to}} (ADR 0001).',
      electron: '{{from}} may not import electron (ADR 0001).',
      node: '{{from}} may not import a Node builtin (ADR 0001).',
    },
  },
  create(context) {
    const fromLayer = layerOf(context.filename);
    const allowed = fromLayer === undefined ? undefined : allowedLayers[fromLayer];
    if (allowed === undefined) return {}; // Untracked path, or main: nothing to check.
    const allowedSet = new Set(allowed);

    function check(sourceNode, specifier) {
      if (specifier === 'electron') {
        if (forbidsElectron.has(fromLayer)) {
          context.report({
            node: sourceNode,
            messageId: 'electron',
            data: { from: `src/${fromLayer}` },
          });
        }
        return;
      }
      if (specifier.startsWith('node:')) {
        if (forbidsNodeBuiltins.has(fromLayer)) {
          context.report({
            node: sourceNode,
            messageId: 'node',
            data: { from: `src/${fromLayer}` },
          });
        }
        return;
      }
      const resolved = resolveSpecifier(specifier, context.filename);
      if (resolved === undefined) return; // An external package: never restricted.
      const toLayer = layerOf(resolved);
      if (toLayer === undefined || toLayer === fromLayer) return; // Outside src, or the same layer.
      if (!allowedSet.has(toLayer)) {
        context.report({
          node: sourceNode,
          messageId: 'layer',
          data: { from: `src/${fromLayer}`, to: `src/${toLayer}` },
        });
      }
    }

    return {
      ImportDeclaration(node) {
        check(node.source, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source !== null) check(node.source, node.source.value);
      },
      ExportAllDeclaration(node) {
        check(node.source, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal' && typeof node.source.value === 'string') {
          check(node.source, node.source.value);
        }
      },
    };
  },
};
