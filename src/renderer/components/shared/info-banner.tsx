import { Info } from 'lucide-react';
import type React from 'react';

import { cn } from '@/renderer/lib/utils';

export interface InfoBannerProps {
  readonly 'aria-label'?: string;
  readonly className?: string;
  readonly message: React.ReactNode;
  readonly title?: string;
}

/**
 * An informational banner indicating a current workflow state or mode.
 * Uses the app's persistent warning-callout treatment for a mode that changes workflow behavior.
 */
export function InfoBanner({
  'aria-label': ariaLabel,
  className,
  message,
  title,
}: InfoBannerProps): React.JSX.Element {
  return (
    <div
      aria-label={ariaLabel ?? title ?? 'Information'}
      className={cn(
        'border-status-warning/40 bg-status-warning/10 flex items-start gap-3 rounded-lg border px-4 py-3',
        className,
      )}
      role="status"
    >
      <Info aria-hidden="true" className="text-status-warning mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 text-xs">
        {title !== undefined && <h2 className="text-foreground text-sm font-semibold">{title}</h2>}
        <div
          className={cn('text-muted-foreground leading-relaxed', title !== undefined && 'mt-0.5')}
        >
          {message}
        </div>
      </div>
    </div>
  );
}
