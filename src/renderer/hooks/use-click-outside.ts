import { useEffect, useRef } from 'react';

/**
 * Closes something open when a pointer goes down outside the element the returned ref is attached
 * to. Listening is on only while `active` is true, so a closed popover adds nothing to the page.
 *
 * `onOutside` does not need to be stable across renders: the effect only depends on `active`, and
 * always calls the latest callback, so passing a fresh inline function every render never causes
 * the listener to be removed and re-added.
 */
export function useClickOutside<T extends HTMLElement>(
  active: boolean,
  onOutside: () => void,
): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const onOutsideRef = useRef(onOutside);

  useEffect(() => {
    onOutsideRef.current = onOutside;
  });

  useEffect(() => {
    if (!active) return;
    const handlePointerDown = (event: PointerEvent): void => {
      if (!ref.current?.contains(event.target as Node)) onOutsideRef.current();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [active]);

  return ref;
}
