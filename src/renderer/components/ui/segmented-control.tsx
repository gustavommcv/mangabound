import { cn } from '@/renderer/lib/utils';

interface SegmentedControlProps<T extends string> {
  readonly label: string;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
}

/** A short list of exclusive choices shown side by side, as a radio group. */
export function SegmentedControl<T extends string>({
  disabled = false,
  label,
  onChange,
  options,
  value,
}: SegmentedControlProps<T>): React.JSX.Element {
  const move = (from: number, step: number): void => {
    const next = options[(from + step + options.length) % options.length];
    if (next !== undefined) onChange(next.value);
  };
  return (
    <div aria-label={label} className="bg-muted flex gap-0.5 rounded-lg p-0.5" role="radiogroup">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            aria-checked={selected}
            className={cn(
              'focus-visible:ring-ring flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
              selected ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:text-foreground',
            )}
            disabled={disabled}
            key={option.value}
            onClick={() => {
              onChange(option.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                move(index, 1);
              } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                move(index, -1);
              }
            }}
            role="radio"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
