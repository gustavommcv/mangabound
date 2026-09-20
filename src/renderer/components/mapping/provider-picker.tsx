import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { cn } from '@/renderer/lib/utils';
import type { MetadataProviderDescriptor } from '@/shared/workflow-contract';

interface Option {
  /** The provider's id, or undefined for "no online source". */
  readonly value: string | undefined;
  readonly title: string;
  readonly detail: string;
}

function hostOf(homepage: string): string {
  try {
    return new URL(homepage).host;
  } catch {
    return homepage;
  }
}

/**
 * The list of online sources, opened from one field: a name and the service's address for each,
 * with a first entry for using none. Nothing is chosen until a person chooses it. This is the ARIA
 * "select-only combobox": focus stays on the field, and the arrow keys move through the options.
 */
export function ProviderPicker({
  label = 'Source',
  onSelect,
  providers,
  selectedId,
}: {
  readonly label?: string;
  readonly onSelect: (providerId: string | undefined) => void;
  readonly providers: readonly MetadataProviderDescriptor[];
  readonly selectedId: string | undefined;
}): React.JSX.Element {
  const base = useId();
  const listId = `${base}-list`;
  const labelId = `${base}-label`;
  const optionId = (index: number): string => `${base}-option-${String(index)}`;
  const options: readonly Option[] = [
    { value: undefined, title: 'No online source', detail: 'Only the folder names and your edits' },
    ...providers.map((provider) => ({
      value: provider.id,
      title: provider.displayName,
      detail: `${hostOf(provider.homepage)} · ${provider.description}`,
    })),
  ];
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === selectedId),
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selectedIndex);
  const root = useRef<HTMLDivElement>(null);
  const chosen = selectedId === undefined ? undefined : options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('mousedown', close);
    };
  }, [open]);

  const show = (): void => {
    setActive(selectedIndex);
    setOpen(true);
  };
  const choose = (index: number): void => {
    onSelect(options[index]?.value);
    setOpen(false);
  };
  const move = (index: number): void => {
    setActive(Math.min(options.length - 1, Math.max(0, index)));
  };

  return (
    <div className="space-y-1.5">
      <p className="text-sm leading-none font-medium" id={labelId}>
        {label}
      </p>
      <div className="relative" ref={root}>
        <button
          aria-activedescendant={open ? optionId(active) : undefined}
          aria-controls={open ? listId : undefined}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-labelledby={labelId}
          className="border-border bg-background focus-visible:ring-ring flex h-10 w-full items-center justify-between gap-3 rounded-md border px-3 text-left text-sm outline-none focus-visible:ring-2"
          onClick={() => {
            if (open) setOpen(false);
            else show();
          }}
          onKeyDown={(event) => {
            if (!open) {
              if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
                event.preventDefault();
                show();
              }
              return;
            }
            switch (event.key) {
              case 'ArrowDown':
                move(active + 1);
                break;
              case 'ArrowUp':
                move(active - 1);
                break;
              case 'Home':
                move(0);
                break;
              case 'End':
                move(options.length - 1);
                break;
              case 'Enter':
              case ' ':
                choose(active);
                break;
              case 'Escape':
                setOpen(false);
                break;
              default:
                // Tab and everything else carry on, closing the list as focus leaves.
                if (event.key === 'Tab') setOpen(false);
                return;
            }
            event.preventDefault();
          }}
          role="combobox"
          type="button"
        >
          <span className={chosen === undefined ? 'text-muted-foreground' : 'font-medium'}>
            {chosen?.title ?? 'Select a source'}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn('text-muted-foreground size-4 shrink-0', open && 'rotate-180')}
          />
        </button>
        {open && (
          <ul
            aria-labelledby={labelId}
            className="border-border bg-surface absolute top-full right-0 left-0 z-20 mt-1 max-h-80 overflow-auto rounded-xl border p-1"
            id={listId}
            role="listbox"
          >
            {options.map((option, index) => (
              <li
                aria-selected={index === selectedIndex}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5',
                  index === active && 'bg-muted',
                )}
                id={optionId(index)}
                key={option.value ?? 'none'}
                // Chosen on mouse down, before the field loses focus and the list closes with it.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(index);
                }}
                onMouseEnter={() => {
                  setActive(index);
                }}
                role="option"
              >
                <span
                  aria-hidden="true"
                  className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
                >
                  {option.value === undefined ? '–' : option.title.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{option.title}</span>
                  <span className="text-subtle-foreground block truncate text-xs">
                    {option.detail}
                  </span>
                </span>
                {index === selectedIndex && (
                  <Check aria-hidden="true" className="text-accent size-4 shrink-0" />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
