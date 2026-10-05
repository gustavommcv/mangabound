/** Prevents an explicit deletion from racing an export of the same pending run. */
export class PendingRunActivity {
  private readonly exports = new Map<string, number>();
  private readonly deletions = new Set<string>();

  beginExport(runId: string): (() => void) | undefined {
    if (this.deletions.has(runId)) return undefined;
    this.exports.set(runId, (this.exports.get(runId) ?? 0) + 1);
    return () => {
      const remaining = this.exports.get(runId)! - 1;
      if (remaining === 0) this.exports.delete(runId);
      else this.exports.set(runId, remaining);
    };
  }

  beginDelete(runId: string): (() => void) | undefined {
    if (this.deletions.has(runId) || this.exports.has(runId)) return undefined;
    this.deletions.add(runId);
    return () => this.deletions.delete(runId);
  }

  isDeleting(runId: string): boolean {
    return this.deletions.has(runId);
  }

  /** Whether any pending run is being deleted: what a share of every ready book must wait for. */
  isDeletingAny(): boolean {
    return this.deletions.size > 0;
  }
}
