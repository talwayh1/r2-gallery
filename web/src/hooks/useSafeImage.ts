import { useState, useCallback, useRef, useEffect } from 'react';

interface UseSafeImageOptions {
  /** Number of automatic retry attempts on error (default: 2) */
  maxRetries?: number;
}

interface UseSafeImageReturn {
  /** Image failed to load (after all retries exhausted) */
  failed: boolean;
  /** Image successfully loaded */
  loaded: boolean;
  /** Current retry attempt number (0 = first attempt) */
  retryCount: number;
  /** Callback for <img onLoad> */
  handleLoad: () => void;
  /** Callback for <img onError> */
  handleError: () => void;
  /** CSS class string for fade-in effect */
  imgClasses: string;
  /** Manually retry loading */
  retry: () => void;
}

/**
 * Shared logic for safe image loading with shimmer skeleton, fade-in,
 * and automatic retry with exponential backoff.
 *
 * Takes a `key` that uniquely identifies the image source — when the key changes,
 * states (loaded/failed) are automatically reset for the transition.
 *
 * On error, automatically retries up to `maxRetries` times with
 * exponential backoff delay (500ms, 1000ms, ...). After exhausting retries,
 * `failed` becomes true.
 */
export function useSafeImage(key: string, options?: UseSafeImageOptions): UseSafeImageReturn {
  const { maxRetries = 2 } = options ?? {};
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const prevKeyRef = useRef(key);
  const retryTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => retryTimers.current.forEach(clearTimeout);
  }, []);

  // Reset states when the key (path/url) changes
  useEffect(() => {
    if (prevKeyRef.current !== key) {
      prevKeyRef.current = key;
      setLoaded(false);
      setFailed(false);
      setRetryCount(0);
      // Clear pending retry timers
      retryTimers.current.forEach(clearTimeout);
      retryTimers.current = [];
    }
  }, [key]);

  const handleLoad = useCallback(() => {
    setLoaded(true);
    setFailed(false);
    // Clear any pending retries — image loaded successfully
    retryTimers.current.forEach(clearTimeout);
    retryTimers.current = [];
  }, []);

  const handleError = useCallback(() => {
    if (retryCount < maxRetries) {
      // Exponential backoff: 500ms, 1000ms, ...
      const delay = 500 * Math.pow(2, retryCount);
      const timer = setTimeout(() => {
        setRetryCount(c => c + 1);
        setLoaded(false);
      }, delay);
      retryTimers.current.push(timer);
    } else {
      setFailed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount, maxRetries]);

  const retry = useCallback(() => {
    setFailed(false);
    setLoaded(false);
    setRetryCount(0);
    retryTimers.current.forEach(clearTimeout);
    retryTimers.current = [];
  }, []);

  const imgClasses = `${loaded ? 'img-fade-in' : 'opacity-0'}`;

  return { failed, loaded, retryCount, handleLoad, handleError, imgClasses, retry };
}