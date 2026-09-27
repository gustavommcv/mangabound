import { RotateCcw } from 'lucide-react';
import { useRef } from 'react';

import { Button } from '@/renderer/components/ui/button';
import { Label } from '@/renderer/components/ui/label';
import { cn } from '@/renderer/lib/utils';

/** A changed setting is recognizable by color and by its labeled, keyboard-accessible action. */
export function SettingFieldHeader({
  changed,
  disabled = false,
  id,
  label,
  onReset,
  optional = false,
}: {
  readonly changed: boolean;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly label: string;
  readonly onReset: () => void;
  readonly optional?: boolean;
}): React.JSX.Element {
  const header = useRef<HTMLDivElement>(null);
  const labelClass = cn(
    'text-sm font-medium',
    disabled && 'text-muted-foreground',
    changed && 'text-accent',
  );

  return (
    <div
      className="focus-visible:ring-ring relative pr-7 outline-none focus-visible:rounded-sm focus-visible:ring-2"
      ref={header}
      tabIndex={-1}
    >
      {id === undefined ? (
        <span className={labelClass}>{label}</span>
      ) : (
        <Label className={labelClass} htmlFor={id}>
          {label}
          {optional && (
            <>
              {' '}
              <span className="text-subtle-foreground font-normal">(optional)</span>
            </>
          )}
        </Label>
      )}
      {changed && (
        <Button
          aria-label={`Restore default for ${label}`}
          className="text-accent hover:bg-accent/10 hover:text-accent absolute -top-0.5 right-0 size-6 p-0"
          onClick={() => {
            onReset();
            const control = id === undefined ? null : document.getElementById(id);
            if (control instanceof HTMLElement && !control.matches(':disabled')) control.focus();
            else header.current?.focus();
          }}
          size="icon"
          title={`Restore default for ${label}`}
          variant="ghost"
        >
          <RotateCcw aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
