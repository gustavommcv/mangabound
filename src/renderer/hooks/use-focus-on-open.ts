import { useEffect, useRef } from 'react';

/**
 * Moves keyboard focus to the element the returned ref is attached to when `open` becomes true.
 * For a question that appears in place of a click (an inline confirmation): focus stays on the
 * button that was pressed otherwise, a keyboard user has to Tab to find the question, and a screen
 * reader is not told it appeared. The element needs `tabIndex={-1}` to take focus.
 */
export function useFocusOnOpen<T extends HTMLElement>(open: boolean): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  return ref;
}
