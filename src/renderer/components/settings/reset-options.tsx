import { RotateCcw } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { Button } from '@/renderer/components/ui/button';

/**
 * Puts options back to their defaults, after a second click: what it discards is also what was
 * saved for the next session (ADR 0014). It stays in place, dimmed, when there is nothing to
 * reset, so it can always be found and keyboard focus is never left on something that vanished.
 */
export function ResetOptions({
  changed,
  onReset,
  scope,
}: {
  /** Whether anything differs from the defaults. */
  readonly changed: boolean;
  readonly onReset: () => void;
  /** What goes back, as it reads in "Put ___ back to their defaults?". */
  readonly scope: string;
}): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const reasonId = useId();

  const close = (): void => {
    setConfirming(false);
    trigger.current?.focus();
  };

  return (
    <div className="space-y-2">
      <Button
        aria-controls={confirming ? panelId : undefined}
        aria-describedby={changed ? undefined : reasonId}
        aria-disabled={!changed}
        aria-expanded={confirming}
        className="aria-disabled:hover:text-muted-foreground -ml-3 aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
        onClick={() => {
          if (!changed) return;
          setDone(false);
          setConfirming(true);
        }}
        ref={trigger}
        size="sm"
        variant="ghost"
      >
        <RotateCcw /> Reset to defaults
      </Button>
      {!changed && (
        <span className="sr-only" id={reasonId}>
          Every option is already at its default.
        </span>
      )}
      {confirming && changed && (
        <div
          aria-label="Confirm reset"
          className="border-border bg-background space-y-3 rounded-lg border p-3"
          id={panelId}
          onKeyDown={(event) => {
            if (event.key === 'Escape') close();
          }}
          role="group"
        >
          <p className="text-muted-foreground text-xs leading-relaxed">
            Put {scope} back to their defaults?
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                onReset();
                setDone(true);
                close();
              }}
              size="sm"
            >
              Reset
            </Button>
            <Button onClick={close} size="sm" variant="outline">
              Cancel
            </Button>
          </div>
        </div>
      )}
      <p className="sr-only" role="status">
        {done ? 'Every option is back to its default.' : ''}
      </p>
    </div>
  );
}
