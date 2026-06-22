import { useEffect, useRef } from 'react';

/**
 * Touch gesture hook for swipe navigation (only when not zoomed).
 * Detects horizontal swipes (left/right) for navigation and vertical
 * downward swipe for closing/closing gestures with progress feedback.
 */
export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  onSwipeDown,
  onSwipeProgress,
  enabled,
}: {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onSwipeDown: () => void;
  onSwipeProgress?: (dy: number) => void;
  enabled: boolean;
}) {
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const swipeDownConfirmed = useRef(false);

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
      const dy = touch.clientY - touchStart.current.y;
      const dt = Date.now() - touchStart.current.time;

      // Only show progress for downward swipes (not left/right navigations)
      if (dy > 0 && dt < 500 && onSwipeProgress) {
        if (dy > 30) swipeDownConfirmed.current = true;
        onSwipeProgress(dy);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!enabled || !touchStart.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;
      const dt = Date.now() - touchStart.current.time;
      touchStart.current = null;

      const minDist = 50;
      const maxDuration = 500;
      if (dt > maxDuration) return;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx > absDy && absDx > minDist) {
        if (dx < 0) onSwipeLeft();
        else onSwipeRight();
      } else if (dy > 0 && (swipeDownConfirmed.current || (absDy > minDist))) {
        // Close if dragged past threshold (30% of viewport height)
        const closeThreshold = Math.min(window.innerHeight * 0.3, 200);
        if (dy >= closeThreshold) {
          onSwipeDown();
        } else {
          // Snap back with animation
          onSwipeProgress?.(0);
          swipeDownConfirmed.current = false;
        }
      } else {
        // Snap back if not a downward swipe or too short
        if (dy > 0) onSwipeProgress?.(0);
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
  }, [onSwipeLeft, onSwipeRight, onSwipeDown, onSwipeProgress, enabled]);

  return containerRef;
}
