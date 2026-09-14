import { ChevronDown } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/renderer/lib/utils';

function NativeSelect({
  children,
  className,
  ...props
}: React.ComponentProps<'select'>): React.JSX.Element {
  return (
    <div className="relative">
      <select
        className={cn(
          'border-border bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/30 h-9 w-full appearance-none rounded-md border py-1 pr-9 pl-3 text-sm transition-[border-color,box-shadow] outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        data-slot="native-select"
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      />
    </div>
  );
}

export { NativeSelect };
