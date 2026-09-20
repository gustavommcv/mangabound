import { cn } from '@/renderer/lib/utils';

export interface TabItem<T extends string> {
  readonly id: T;
  readonly label: string;
}

/** The id of a tab, for the panel it controls to be labelled by. */
export const tabId = (group: string, id: string): string => `${group}-tab-${id}`;
/** The id of the panel a tab controls. */
export const panelId = (group: string, id: string): string => `${group}-panel-${id}`;

/**
 * A row of tabs that switch what is shown below, with the keyboard behaviour of the ARIA tabs
 * pattern: one tab in the tab order, the arrow keys moving between them, Home and End jumping to
 * the ends. The panels are the caller's, each with `role="tabpanel"` and the ids above.
 */
export function TabList<T extends string>({
  group,
  label,
  onChange,
  tabs,
  value,
}: {
  readonly group: string;
  readonly label: string;
  readonly onChange: (value: T) => void;
  readonly tabs: readonly TabItem<T>[];
  readonly value: T;
}): React.JSX.Element {
  const go = (index: number): void => {
    const target = tabs[(index + tabs.length) % tabs.length];
    if (target === undefined) return;
    onChange(target.id);
    document.getElementById(tabId(group, target.id))?.focus();
  };
  return (
    <div aria-label={label} className="bg-muted flex gap-0.5 rounded-lg p-0.5" role="tablist">
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        return (
          <button
            aria-controls={panelId(group, tab.id)}
            aria-selected={selected}
            className={cn(
              'focus-visible:ring-ring rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2',
              selected ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:text-foreground',
            )}
            id={tabId(group, tab.id)}
            key={tab.id}
            onClick={() => {
              onChange(tab.id);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') go(index + 1);
              else if (event.key === 'ArrowLeft') go(index - 1);
              else if (event.key === 'Home') go(0);
              else if (event.key === 'End') go(tabs.length - 1);
              else return;
              event.preventDefault();
            }}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
