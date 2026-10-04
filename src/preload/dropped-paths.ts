/**
 * The place on disk of each file dropped on the window, in the order they were dropped.
 *
 * What is dropped comes from the page, which is not trusted: it can pass anything where the bridge
 * asks for a list of files. A plain object with a `map` of its own, for one, would make
 * `files.map(...)` run the page's function and choose the paths itself (`contextBridge` hands a
 * function over as one that can be called). So only a real array is read, element by element and
 * by index, and nothing the page defined on it runs. Anything else is `undefined`, which the main
 * process refuses as an invalid command.
 *
 * `pathOf` is what decides whether an element is a file: an element that is not one gives no path.
 */
export function droppedPaths(
  files: unknown,
  pathOf: (file: unknown) => string,
): readonly string[] | undefined {
  if (!Array.isArray(files)) return undefined;
  const dropped: readonly unknown[] = files;
  const paths: string[] = [];
  for (let index = 0; index < dropped.length; index += 1) paths.push(pathOf(dropped[index]));
  return paths;
}
