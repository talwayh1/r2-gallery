import { useEffect, useRef, type MutableRefObject } from 'react';

/**
 * Calls `handler` when a click/touch occurs outside `ref`.
 *
 * @example
 * ```tsx
 * const menuRef = useClickOutside<HTMLDivElement>(() => setOpen(false));
 * ```
 */
export function useClickOutside<T extends HTMLElement>(
  handler: () => void,
  enabled = true,
): MutableRefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const handleClick = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [handler, enabled]);

  return ref;
}