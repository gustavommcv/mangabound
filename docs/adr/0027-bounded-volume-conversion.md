# ADR 0027: Convert separate volumes with bounded concurrency

- Status: Accepted
- Date: 2026-09-28

## Context

Mangabind writes all volume CBZs in one run, but the workflow previously waited for each mangapress conversion to finish before starting the next. On a real 11-volume, 1,976-page manga, the bundled mangapress took about 65 seconds in sequence and about 32 seconds with three independent conversions at once on a 12-logical-processor, 32 GiB machine. Four at once were slower. Mangapress already processes pages in parallel inside each process, so launching every volume at once would oversubscribe smaller machines and increase memory pressure.

## Decision

- For separate volumes that use mangapress, run a bounded worker pool within one title. The limit is the lesser of three, one worker per four available logical processors, and one worker per four GiB of installed memory, with at least one worker. The main process reads the machine's capacity and passes the limit into the application workflow; the workflow itself has no operating-system dependency.
- Mangabind still runs once before these workers start. A single book, a direct CBZ, and bind-only copying keep their single-process flow. Library titles remain sequential, while volumes within one title may overlap. This avoids running multiple titles' conversion pools at once.
- Results and catalog publication follow input volume order even if subprocesses finish out of order. A completed prefix is published as soon as it is ready. If one volume fails, do not start another; let active subprocesses finish so their output is not interrupted during a file write, then publish any later volumes that succeeded. Keep the original error and the session for a retry. An explicit user cancellation still aborts every active subprocess.
- Progress combines each volume's reported page fraction into one monotonic whole-title bar. A volume contributes at most 99% until its output is complete. The bar reaches 100% only when all volumes complete. The main status changes only when a volume finishes; an optional, collapsed-by-default details panel shows each volume's status and bar without a nested scrollbar.

## Consequences

Multi-volume conversion uses more CPU and memory for a shorter period, within a conservative bound. The observed speedup is specific to the tested machine and manga, not a guaranteed time for every device. The mangabind intermediate files remain in place; eliminating them would require a separate cross-tool input contract and evidence that their I/O remains a bottleneck. Unit tests cover the worker limit, out-of-order completion, ordered publication, aggregate progress, failure and cancellation. The packaged-app tests continue to exercise the real bundled tools and multi-volume output.
