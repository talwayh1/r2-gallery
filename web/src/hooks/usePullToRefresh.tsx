/**
 * Pull-to-Refresh Hook — lightweight mobile pull-down gesture.
 *
 * Usage:
 *   const ptr = usePullToRefresh({ scrollRef, onRefresh });
 *   attach ptr.handlers to the scroll container (onTouchStart/Move/End).
 *   render <PullToRefreshIndicator pullDistance={ptr.pullDistance} refreshing={ptr.refreshing} />.
 *
 * Gesture logic:
 * - Only activates when scroll container is at scrollTop === 0.
 * - User pulls down; visual follows finger up to a max rubber-band.
 * - Released past THRESHOLD → calls onRefresh, shows spinner until onRefresh promise settles.
 * - Released below THRESHOLD → snaps back with no action.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { hapticFeedback } from '../utils/mobile';

interface UsePullToRefreshOptions {
  /** The scrollable container ref */
  scrollRef: React.RefObject<HTMLElement | null>;
  /** Called when the user releases past the threshold */
  onRefresh: () => void | Promise<void>;
  /** Minimum pull distance (px) to trigger refresh on release (default: 60) */
  threshold?: number;
  /** Maximum rubber-band distance (px) — how far the indicator can stretch (default: 120) */
  maxPull?: number;
  /** Only active on narrow viewports (default: '(max-width: 640px)') */
  query?: string;
}

const DEFAULT_THRESHOLD = 60;
const DEFAULT_MAX_PULL = 120;

export interface PullToRefreshState {
  pullDistance: number;
  refreshing: boolean;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
  };
}

/** Ease-out curve for natural rubber-band feel */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - Math.min(t, 1), 2);
}

export function usePullToRefresh({
  scrollRef,
  onRefresh,
  threshold = DEFAULT_THRESHOLD,
  maxPull = DEFAULT_MAX_PULL,
  query = '(max-width: 640px)',
}: UsePullToRefreshOptions): PullToRefreshState {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startY = useRef(0);
  const pulling = useRef(false);
  const refresher = useRef<Promise<void> | null>(null);
  const rafId = useRef(0);
  const crossedThreshold = useRef(false);
  // Refs to avoid stale closures in touch handlers
  const pullDistanceRef = useRef(0);
  const maxPullRef = useRef(maxPull);
  const thresholdRef = useRef(threshold);
  const queryRef = useRef(query);
  maxPullRef.current = maxPull;
  thresholdRef.current = threshold;
  queryRef.current = query;

  // Sync ref with state so touch handlers always read the latest value
  useEffect(() => {
    pullDistanceRef.current = pullDistance;
  }, [pullDistance]);

  // Cleanup animation frames
  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = scrollRef.current;
    if (!el || refreshing) return;
    // Only activate when scrolled to the very top
    if (el.scrollTop > 0) return;
    // Only on mobile
    if (!window.matchMedia(queryRef.current).matches) return;

    startY.current = e.touches[0].clientY;
    pulling.current = true;
    crossedThreshold.current = false;
  }, [scrollRef, refreshing]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current || refreshing) return;
    const el = scrollRef.current;
    if (!el) return;

    // If user has scrolled past top during the gesture, cancel
    if (el.scrollTop < 0) return;

    const currentY = e.touches[0].clientY;
    const dy = currentY - startY.current;

    if (dy <= 0) {
      // Scrolling up / not pulling down
      if (pullDistanceRef.current > 0) {
        setPullDistance(0);
        pullDistanceRef.current = 0;
      }
      return;
    }

    // Rubber-band: ease out after crossing a small dead zone
    const raw = Math.min(dy, maxPullRef.current + 60);
    const eased = raw > 5 ? easeOut((raw - 5) / maxPullRef.current) * maxPullRef.current : 0;

    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      setPullDistance(eased);
      pullDistanceRef.current = eased;

      // Haptic feedback when first crossing the threshold
      if (eased >= thresholdRef.current && !crossedThreshold.current) {
        crossedThreshold.current = true;
        hapticFeedback('medium');
      } else if (eased < thresholdRef.current && crossedThreshold.current) {
        crossedThreshold.current = false;
      }
    });
  }, [refreshing, scrollRef]);

  const onTouchEnd = useCallback((_e: React.TouchEvent) => {
    if (!pulling.current) return;
    pulling.current = false;

    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = 0;
    }

    if (refreshing) return;

    const pd = pullDistanceRef.current;
    if (pd >= thresholdRef.current) {
      // Trigger refresh with haptic confirmation
      hapticFeedback('medium');
      setRefreshing(true);
      setPullDistance(thresholdRef.current); // hold at threshold height for visual
      const result = onRefresh();
      if (result && typeof result.then === 'function') {
        refresher.current = result.then(() => {
          setRefreshing(false);
          setPullDistance(0);
          pullDistanceRef.current = 0;
        }).catch(() => {
          setRefreshing(false);
          setPullDistance(0);
          pullDistanceRef.current = 0;
        });
      } else {
        // Synchronous refresh
        setRefreshing(false);
        setPullDistance(0);
        pullDistanceRef.current = 0;
      }
    } else {
      // Snap back
      setPullDistance(0);
      pullDistanceRef.current = 0;
    }
  }, [refreshing, onRefresh]);

  return {
    pullDistance,
    refreshing,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  refreshing: boolean;
}

/**
 * Visual indicator rendered above the scroll container.
 * Shows an arrow + "下拉刷新" / "释放刷新" when pulling,
 * then an animated spinner while refreshing.
 */
export function PullToRefreshIndicator({ pullDistance, refreshing }: PullToRefreshIndicatorProps) {
  const { t } = useTranslation();
  if (pullDistance <= 0 && !refreshing) return null;

  const showRelease = pullDistance >= 60;
  const opacity = Math.min(pullDistance / 60, 1);

  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-[height] duration-200 ease-out"
      style={{
        height: refreshing ? 48 : Math.min(pullDistance, 60),
        opacity: refreshing ? 1 : opacity,
      }}
    >
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        {refreshing ? (
          <>
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span>{t('ptr.refreshing')}</span>
          </>
        ) : showRelease ? (
          <>
            <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            <span className="font-medium text-blue-500">{t('ptr.release')}</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            <span>{t('ptr.pull')}</span>
          </>
        )}
      </div>
    </div>
  );
}