import { useState, useCallback, useRef, useEffect } from 'react';

interface UseSafeImageReturn {
  /** Image failed to load */
  failed: boolean;
  /** Image successfully loaded */
  loaded: boolean;
  /** Callback for <img onLoad> */
  handleLoad: () => void;
  /** Callback for <img onError> */
  handleError: () => void;
  /** CSS class string for fade-in effect */
  imgClasses: string;
}

/**
 * Shared logic for safe image loading with shimmer skeleton and fade-in.
 *
 * Takes a `key` that uniquely identifies the image source — when the key changes,
 * states (loaded/failed) are automatically reset for the transition.
 * Used by both SafeThumb (path-based) and SafeThumbUrl (url-based) to avoid
 * duplicating state logic across components.
 */
export function useSafeImage(key: string): UseSafeImageReturn {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const prevKeyRef = useRef(key);

  // Reset states when the key (path/url) changes
  useEffect(() => {
    if (prevKeyRef.current !== key) {
      prevKeyRef.current = key;
      setLoaded(false);
      setFailed(false);
    }
  }, [key]);

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => setFailed(true), []);

  const imgClasses = `${loaded ? 'img-fade-in' : 'opacity-0'}`;

  return { failed, loaded, handleLoad, handleError, imgClasses };
}