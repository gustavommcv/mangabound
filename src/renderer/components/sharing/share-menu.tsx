import { RadioTower, X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { Button } from '@/renderer/components/ui/button';
import { cn } from '@/renderer/lib/utils';

export interface ShareMenuProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Whether the catalog is being served now, which the button says without opening anything. */
  readonly sharing: boolean;
  /** The panel that is shown while it is open. It must have a heading with the id `share-title`. */
  readonly children: React.ReactNode;
}

/**
 * The Share button of the title bar, and the panel it opens under it. Only one place in the
 * window starts or stops sharing, and this is it (ADR 0016): the results screen opens this panel
 * rather than carrying a second set of controls.
 *
 * The panel is not a modal: nothing behind it is blocked or hidden from assistive technology. Focus
 * moves into it when it opens, so a keyboard or screen-reader user lands in it, and Escape puts it
 * away and returns focus to where it came from. A click anywhere else puts it away without moving
 * focus, so whatever was clicked keeps it.
 */
export function ShareMenu({
  open,
  onOpenChange,
  sharing,
  children,
}: ShareMenuProps): React.JSX.Element {
  const wrapper = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Set by the ways of closing that come from the keyboard or the panel's own button.
  const returnFocus = useRef(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    panel.current?.focus();
    return () => {
      if (returnFocus.current && opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
      returnFocus.current = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent): void => {
      if (!wrapper.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', away);
    return () => {
      document.removeEventListener('pointerdown', away);
    };
  }, [open, onOpenChange]);

  const close = (): void => {
    returnFocus.current = true;
    onOpenChange(false);
  };

  return (
    <div
      className="relative"
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') close();
      }}
      ref={wrapper}
    >
      <Button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(sharing && 'text-accent')}
        onClick={() => {
          onOpenChange(!open);
        }}
        size="sm"
        variant="outline"
      >
        <RadioTower /> {sharing ? 'Sharing' : 'Share'}
      </Button>
      {open && (
        <div
          aria-labelledby="share-title"
          className="absolute top-full right-0 z-50 mt-2 max-h-[calc(100vh-4.5rem)] w-[26rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl outline-none"
          id={panelId}
          ref={panel}
          role="dialog"
          tabIndex={-1}
        >
          <div className="relative">
            {children}
            <Button
              aria-label="Close sharing"
              className="absolute top-3 right-3"
              onClick={close}
              size="icon"
              variant="ghost"
            >
              <X />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
