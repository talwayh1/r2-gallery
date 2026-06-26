import { useEffect, useRef } from 'react';

/**
 * Touch gesture hook for swipe navigation (only when not zoomed).
 * Detects horizontal swipes (left/right) for navigation and vertical
 * downward swipe for closing/closing gestures with progress feedback.
 *
 * Uses callback refs internally to avoid re-attaching touch event
 * listeners on every render when parent passes unstable callbacks.
 */
export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  onSwipeDown,
  onSwipeProgress,
  onSwipeProgressX,
  enabled,
}: {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onSwipeDown: () => void;
  onSwipeProgress?: (dy: number) => void;
  onSwipeProgressX?: (dx: number) => void;
  enabled: boolean;
}) {
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const swipeDownConfirmed = useRef(false);

  // Stable callback refs — avoids useEffect re-running when callbacks change
  const onSwipeLeftRef = useRef(onSwipeLeft);
  onSwipeLeftRef.current = onSwipeLeft;
  const onSwipeRightRef = useRef(onSwipeRight);
  onSwipeRightRef.current = onSwipeRight;
  const onSwipeDownRef = useRef(onSwipeDown);
  onSwipeDownRef.current = onSwipeDown;
  const onSwipeProgressRef = useRef(onSwipeProgress);
  onSwipeProgressRef.current = onSwipeProgress;
  const onSwipeProgressXRef = useRef(onSwipeProgressX);
  onSwipeProgressXRef.current = onSwipeProgressX;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (!enabled) return;
      const touch = e.touches[0];
      touchStart.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      swipeDownConfirmed.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!enabled || !touchStart.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;

      // Always track horizontal progress for visual feedback
      if (onSwipeProgressXRef.current) {
        onSwipeProgressXRef.current(dx);
      }

      // Track downward progress for visual feedback (no time limit)
      if (dy > 0 && onSwipeProgressRef.current) {
        if (dy > 30) swipeDownConfirmed.current = true;
        onSwipeProgressRef.current(dy);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!enabled || !touchStart.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;
      touchStart.current = null;

      const minDist = 50;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx > absDy && absDx > minDist) {
        if (dx < 0) onSwipeLeftRef.current();
        else onSwipeRightRef.current();
        // Reset horizontal tracking after navigation
        onSwipeProgressXRef.current?.(0);
      } else if (dy > 0 && (swipeDownConfirmed.current || (absDy > minDist))) {
        // Close if dragged past threshold (30% of viewport height)
        const closeThreshold = Math.min(window.innerHeight * 0.3, 200);
        if (dy >= closeThreshold) {
          onSwipeDownRef.current();
        } else {
          // Snap back with animation
          onSwipeProgressRef.current?.(0);
          swipeDownConfirmed.current = false;
        }
        // Reset horizontal tracking on vertical swipe end
        onSwipeProgressXRef.current?.(0);
      } else {
        // Snap back if not a swipe or too short
        if (dy > 0) onSwipeProgressRef.current?.(0);
        // Reset horizontal tracking on short/cancelled swipes
        if (absDx > 0) onSwipeProgressXRef.current?.(0);
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
    // Only re-attach when enabled state or the container ref element changes.
    // Callback refs keep stable references regardless of parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return containerRef;
}
