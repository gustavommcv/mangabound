import { X } from 'lucide-react';

import { Button } from '@/renderer/components/ui/button';

/**
 * Things worth telling the person that are not errors: a saved setting that could not be used and
 * what took its place. They stay until dismissed, because they are easy to miss at launch.
 */
export function Notices({
  notices,
  onDismiss,
}: {
  readonly notices: readonly string[];
  readonly onDismiss: () => void;
}): React.JSX.Element | null {
  if (notices.length === 0) return null;
  return (
    <div
      aria-label="Notices"
      className="border-status-warning/40 bg-status-warning/10 mb-6 flex items-start gap-3 rounded-lg border px-4 py-3"
      role="status"
    >
      <ul className="min-w-0 flex-1 space-y-1 text-xs">
        {notices.map((notice) => (
          <li key={notice}>{notice}</li>
        ))}
      </ul>
      <Button aria-label="Dismiss these notices" onClick={onDismiss} size="icon" variant="ghost">
        <X />
      </Button>
    </div>
  );
}
