import { useState, useEffect, useRef, useCallback } from 'react';

interface VirtualGridOptions {
  /** Total number of items to render */
  itemCount: number;
  /** Minimum column width in px (grid will auto-fill) */
  minColumnWidth?: number;
  /** Row height in px (including gap) */
  rowHeight?: number;
  /** Gap between items in px */
  gap?: number;
  /** Number of extra rows to render above/below viewport */
  overscan?: number;
}

interface VirtualGridResult {
  /** Ref to attach to the scroll container */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Indices of items to render */
  visibleRange: { start: number; end: number };
  /** Total height of the grid (for spacer) */
  totalHeight: number;
  /** Offset from top for the visible items */
  offsetY: number;
  /** Number of columns calculated from container width */
  columns: number;
  /** Actual row height used (adjusted for mobile screens) */
  rowHeight: number;
}

/**
 * Lightweight virtual grid hook — zero dependencies.
 * Only renders visible rows + overscan buffer for large file grids.
 * Uses requestAnimationFrame to batch scroll updates and avoid
 * unnecessary re-renders on every scroll pixel.
 */
export function useVirtualGrid({
  itemCount,
  minColumnWidth = 200,
  rowHeight = 280, // card height + gap
  gap = 12,
  overscan = 3,
}: VirtualGridOptions): VirtualGridResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({
    scrollTop: 0,
    containerHeight: 0,
    containerWidth: 0,
  });
  const rafRef = useRef<number | null>(null);

  // Measure container on mount and resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      // Cancel any pending RAF to avoid a stale update racing the sync measure
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setState(prev => ({
        ...prev,
        containerHeight: el.clientHeight,
        containerWidth: el.clientWidth,
      }));
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);

    // Listen to scroll — batch via requestAnimationFrame to avoid
    // re-rendering on every scroll pixel (common with smooth-scroll mice/trackpads)
    let scheduled = false;
    const handleScroll = () => {
      if (scheduled) return;
      scheduled = true;
      rafRef.current = requestAnimationFrame(() => {
        scheduled = false;
        rafRef.current = null;
        setState(prev => ({ ...prev, scrollTop: el.scrollTop }));
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

  // Calculate columns from container width — responsive: narrower containers use smaller min width
  const effectiveMinWidth = state.containerWidth < 480
    ? Math.max(minColumnWidth - 50, 130)
    : minColumnWidth;
  const columns = Math.max(1, Math.floor((state.containerWidth + gap) / (effectiveMinWidth + gap)));

  // Adaptive row height — scales proportionally to effectiveMinWidth on mobile
  // Base: 200px min width → rowHeight (280px). On narrow screens, shrink proportionally.
  const effectiveRowHeight = state.containerWidth < 600
    ? Math.max(rowHeight * (effectiveMinWidth / minColumnWidth), 180)
    : rowHeight;

  // Calculate visible range
  const totalRows = Math.ceil(itemCount / columns);
  const totalHeight = totalRows * effectiveRowHeight;

  const startRow = Math.max(0, Math.floor(state.scrollTop / effectiveRowHeight) - overscan);
  const visibleRows = Math.ceil(state.containerHeight / effectiveRowHeight) + 2 * overscan;
  const endRow = Math.min(totalRows, startRow + visibleRows);

  const start = startRow * columns;
  const end = Math.min(itemCount, endRow * columns);
  const offsetY = startRow * effectiveRowHeight;

  return {
    containerRef,
    visibleRange: { start, end },
    totalHeight,
    offsetY,
    columns,
    rowHeight: effectiveRowHeight,
  };
}
