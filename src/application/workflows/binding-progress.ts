import type { BindingProgress } from '@/application/ports/conversion-tools';
import type { ConversionProgress } from '@/domain/conversion';

/** Keep the main message stable while the measured page count advances. */
export function presentBindingProgress(progress: BindingProgress): ConversionProgress {
  const title = progress.manga;
  if (progress.stage === 'inspect') {
    return {
      stage: 'binding',
      title,
      message:
        progress.state === 'started' ? `Inspecting ${title}…` : `Organizing chapters for ${title}…`,
    };
  }
  return {
    stage: 'binding',
    title,
    bindingState: progress.state,
    message: `Building volume ${String(progress.volumeIndex)} of ${String(progress.volumeCount)}…`,
    completed: progress.completedPages,
    total: progress.totalPages,
  };
}
