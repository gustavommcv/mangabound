import { RadioTower } from 'lucide-react';

import { Button } from '@/renderer/components/ui/button';
import type { OpdsSharingStatus } from '@/shared/opds-contract';

export interface SendToKoreaderProps {
  readonly status: OpdsSharingStatus;
  /** Opens the Share panel with the books just saved chosen, unless something else is being shared. */
  readonly onOpen: () => void;
}

/**
 * The way from "books saved" to "books on the e-reader". It carries no controls of its own: sharing
 * is set up in the Share panel, the same one the title bar opens (ADR 0016), and this only takes a
 * person there with the folder they just saved to already chosen.
 */
export function SendToKoreader({ onOpen, status }: SendToKoreaderProps): React.JSX.Element {
  return (
    <section
      aria-labelledby="koreader-title"
      className="border-border bg-surface h-fit space-y-3 rounded-xl border p-5"
    >
      <div className="flex items-center gap-2">
        <RadioTower aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
        <h2 className="text-sm font-medium" id="koreader-title">
          Send to KOReader
        </h2>
        <span className="flex-1" />
        {status.active && (
          <span className="bg-accent/15 text-accent rounded-full px-2.5 py-0.5 text-xs">
            Sharing
          </span>
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        KOReader downloads the books from this computer over your Wi-Fi.
      </p>
      <Button onClick={onOpen} variant="outline">
        {status.active ? 'Show sharing' : 'Share these books'}
      </Button>
    </section>
  );
}
