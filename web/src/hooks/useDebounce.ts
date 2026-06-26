import { useState, useEffect, useCallback, useRef } from 'react';

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
 * Uses useRef internally so the returned callback has a stable reference
 * (only changes when `delay` changes), avoiding unnecessary re-renders
 * in components that receive it as a prop.
 */
export function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // Clear pending timer when delay changes — prevents stale execution
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [delay]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callbackRef.current(...args), delay);
    },
    [delay]
  );

  return debouncedFn as unknown as T;
}