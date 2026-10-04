import type { ConversionProgress } from '@/domain/conversion';

/**
 * Whether a progress message is about one page. A page event changes the progress about once a
 * second, and a live region that followed each of them would read "page 1 of 200", "page 2 of
 * 200", and so on, minutes behind the work and over everything else. Such a message is shown for
 * the eyes only; a message about a stage or a volume is told as it is.
 */
export function isPageEvent(
  progress: ConversionProgress | undefined,
  percentage: number | undefined,
): boolean {
  return progress?.page !== undefined && percentage !== undefined;
}

/** What is told instead of the pages: each tenth of the work. The progress bar has the exact number. */
export function milestone(percentage: number): string {
  return `${String(Math.floor(percentage / 10) * 10)}% complete`;
}
