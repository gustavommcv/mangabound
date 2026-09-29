/** A conservative limit for independent mangapress processes, each of which uses its own threads. */
export function conversionConcurrency(processors: number, memoryBytes: number): number {
  const perCpu = Math.max(1, Math.floor(processors / 4));
  const perMemory = Math.max(1, Math.floor(memoryBytes / (4 * 1024 ** 3)));
  return Math.min(3, perCpu, perMemory);
}
