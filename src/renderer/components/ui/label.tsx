import * as LabelPrimitive from '@radix-ui/react-label';
import type * as React from 'react';

import { cn } from '@/renderer/lib/utils';

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>): React.JSX.Element {
  return (
    <LabelPrimitive.Root
      className={cn(
        'text-foreground text-sm font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
        className,
      )}
      data-slot="label"
      {...props}
    />
  );
}

export { Label };
