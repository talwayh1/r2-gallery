import { useState, useEffect, useRef } from 'react';

interface VirtualListOptions {
  /** Total number of items */
  itemCount: number;
  /** Fixed height per row in px (content + gap) */
  rowHeight?: number;
  /** Number of extra items to render above/below viewport */
  overscan?: number;
}

interface VirtualListResult {
  /** Ref to attach to the scroll container */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Indices of items to render */
  visibleRange: { start: number; end: number };
  /** Total height of the list content (for spacer) */
  totalHeight: number;
  /** Offset from top for the visible slice */
  offsetY: number;
}

/**
 * Lightweight virtual list hook — single-column, fixed row height.
 * Only renders visible items + overscan buffer for large file listings.
 * Uses requestAnimationFrame to batch scroll updates.
 */
export function useVirtualList({
  itemCount,
  rowHeight = 96, // 88px item + 8px gap (space-y-2)
  overscan = 5,
}: VirtualListOptions): VirtualListResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setContainerHeight(el.clientHeight);
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);

    let scheduled = false;
    const handleScroll = () => {
      if (scheduled) return;
      scheduled = true;
      rafRef.current = requestAnimationFrame(() => {
        scheduled = false;
        rafRef.current = null;
        setScrollTop(el.scrollTop);
      });
    };
    el.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', handleScroll);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const totalHeight = itemCount * rowHeight;

  const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(containerHeight / rowHeight) + 2 * overscan;
  const endIdx = Math.min(itemCount, startIdx + visibleCount);
  const offsetY = startIdx * rowHeight;

  return {
    containerRef,
    visibleRange: { start: startIdx, end: endIdx },
    totalHeight,
    offsetY,
  };
}