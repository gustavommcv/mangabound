import type * as React from 'react';

import { cn } from '@/renderer/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>): React.JSX.Element {
  return (
    <input
      className={cn(
        'border-border bg-background text-foreground placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:ring-ring/30 h-9 w-full rounded-md border px-3 py-1 text-sm transition-[border-color,box-shadow] outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      data-slot="input"
      type={type}
      {...props}
    />
  );
}

export { Input };
