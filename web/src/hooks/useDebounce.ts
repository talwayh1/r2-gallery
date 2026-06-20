import { useState, useEffect, useCallback } from 'react';

/**
 * Debounce a value — delays updates until `delay` ms after the last change.
 * Useful for search inputs where filtering on every keystroke is expensive.
 *
 * @param value The source value to debounce
 * @param delay Delay in milliseconds before the debounced value updates
 * @returns The debounced value (lags behind `value` by `delay` ms)
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Debounce a callback — the wrapped function only executes after `delay` ms
 * of inactivity since the last call. Unlike useDebounce (which delays a value),
 * this delays a function invocation directly.
 *
 * Returns a stable reference via useCallback so it can be passed as a prop.
 */
export function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T {
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      if (timer) clearTimeout(timer);
      const newTimer = setTimeout(() => callback(...args), delay);
      setTimer(newTimer);
    },
    [callback, delay, timer]
  );

  return debouncedFn as unknown as T;
}