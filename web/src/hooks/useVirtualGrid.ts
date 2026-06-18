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
}

/**
 * Lightweight virtual grid hook — zero dependencies.
 * Only renders visible rows + overscan buffer for large file grids.
 * Inspired by Immich's virtual scroll implementation.
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

  // Measure container on mount and resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      setState(prev => ({
        ...prev,
        containerHeight: el.clientHeight,
        containerWidth: el.clientWidth,
      }));
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);

    // Also listen to scroll
    const handleScroll = () => {
      setState(prev => ({ ...prev, scrollTop: el.scrollTop }));
    };
    el.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Calculate columns from container width
  const columns = Math.max(1, Math.floor((state.containerWidth + gap) / (minColumnWidth + gap)));

  // Calculate visible range
  const totalRows = Math.ceil(itemCount / columns);
  const totalHeight = totalRows * rowHeight;

  const startRow = Math.max(0, Math.floor(state.scrollTop / rowHeight) - overscan);
  const visibleRows = Math.ceil(state.containerHeight / rowHeight) + 2 * overscan;
  const endRow = Math.min(totalRows, startRow + visibleRows);

  const start = startRow * columns;
  const end = Math.min(itemCount, endRow * columns);
  const offsetY = startRow * rowHeight;

  return {
    containerRef,
    visibleRange: { start, end },
    totalHeight,
    offsetY,
    columns,
  };
}
