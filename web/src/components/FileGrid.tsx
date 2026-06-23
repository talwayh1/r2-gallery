import { useState, useEffect, useRef, useCallback, lazy, Suspense, useMemo } from 'react';
import type { FileItem } from '../types';
import { getFileUrl, getThumbUrl, moveItem, copyFile, duplicateFile, downloadZip, getUrlContent } from '../api';
import { useFolderThumbnails } from '../hooks/useFolderThumbnails';
import { useVirtualGrid } from '../hooks/useVirtualGrid';
import { toast } from '../hooks/useToast';
import { formatSize, formatDate, getKindOrder } from '../utils';
import ShareDialog from './ShareDialog';
import FileTypeIcon from './FileTypeIcon';
import EmptyState from './EmptyState';
import HighlightText from './HighlightText';

/** Long-press threshold (ms) for mobile context menu */
const LONG_PRESS_MS = 500;
/** Max finger movement (px) before long-press is cancelled */
const LONG_PRESS_MOVE_THRESHOLD = 15;

/**
 * Returns touch event handlers for long-press context menu on mobile.
 * Pass a callback that receives (clientX, clientY).
 */
function useLongPress(
  onLongPress: (clientX: number, clientY: number) => void,
  deps: React.DependencyList
) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPos = useRef<{ x: number; y: number } | null>(null);
  const longPressCancelled = useRef(false);

  const clear = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressPos.current = null;
    longPressCancelled.current = false;
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    clear();
    const touch = e.touches[0];
    longPressPos.current = { x: touch.clientX, y: touch.clientY };
    longPressCancelled.current = false;
    longPressTimer.current = setTimeout(() => {
      if (!longPressCancelled.current && longPressPos.current) {
        onLongPress(longPressPos.current.x, longPressPos.current.y);
      }
    }, LONG_PRESS_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clear, ...deps]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!longPressPos.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - longPressPos.current.x);
    const dy = Math.abs(touch.clientY - longPressPos.current.y);
    if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) {
      longPressCancelled.current = true;
      clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clear]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    longPressCancelled.current = true;
    clear();
  }, [clear]);

  return { onTouchStart, onTouchMove, onTouchEnd, clear };
}

const FolderPicker = lazy(() => import('./FolderPicker'));

interface Props {
  files: Record<string, FileItem>;
  dirs: string[];
  dirCounts?: Record<string, number>;
  dirMtimes?: Record<string, number>;
  currentDir: string;
  onNavigate: (path: string) => void;
  onOpen: (path: string, mime: string) => void;
  onDelete?: (paths: string[]) => void;
  onRename?: (path: string, name: string) => void;
  onMove?: () => void; // callback after successful move
  selected?: Set<string>;
  onSelect?: (path: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  loadMoreError?: string | null;
  /** Parent sort from Header — keeps FileGrid in sync with API-returned order */
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  /** Current search term for filename highlighting */
  search?: string;
}

type SortKey = 'name' | 'size' | 'mtime' | 'kind' | 'shuffle';
type SortDir = 'asc' | 'desc';

/** Seeded hash for deterministic shuffle order */
function seededHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Badge label for media types */
function getTypeBadge(mime: string): string | null {
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.startsWith('audio/')) return 'AUDIO';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) return 'ZIP';
  if (mime.includes('word') || mime.includes('document')) return 'DOC';
  if (mime.includes('sheet') || mime.includes('excel')) return 'XLS';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'PPT';
  if (mime.includes('epub')) return 'EPUB';
  return null;
}

/** Badge color classes */
function getBadgeColor(mime: string): string {
  if (mime.startsWith('video/')) return 'bg-purple-500/90 text-white';
  if (mime.startsWith('audio/')) return 'bg-green-500/90 text-white';
  if (mime === 'application/pdf') return 'bg-red-500/90 text-white';
  if (mime.includes('word') || mime.includes('document')) return 'bg-blue-600/90 text-white';
  if (mime.includes('sheet') || mime.includes('excel')) return 'bg-green-600/90 text-white';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'bg-orange-500/90 text-white';
  return 'bg-gray-500/90 text-white';
}

/** Get file extension for badge display */
function getExtBadge(name: string): string | null {
  const ext = name.split('.').pop()?.toUpperCase();
  if (!ext || ext.length > 5) return null;
  return ext;
}

/** Get display name — strip .url extension for shortcut files */
function getDisplayName(name: string): string {
  if (name.endsWith('.url')) return name.slice(0, -4);
  return name;
}

/** Human-readable MIME type label */
function getMimeLabel(mime: string): string {
  if (mime.startsWith('image/')) return '图片';
  if (mime.startsWith('video/')) return '视频';
  if (mime.startsWith('audio/')) return '音频';
  if (mime === 'application/pdf') return 'PDF 文档';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z') || mime.includes('tar') || mime.includes('gzip')) return '压缩包';
  if (mime.includes('word') || mime.includes('document')) return 'Word 文档';
  if (mime.includes('sheet') || mime.includes('excel')) return 'Excel 表格';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'PPT 演示';
  if (mime.includes('epub')) return '电子书';
  if (mime.includes('json')) return 'JSON';
  if (mime.includes('javascript')) return 'JavaScript';
  if (mime.includes('html')) return 'HTML';
  if (mime.includes('css')) return 'CSS';
  if (mime.includes('text')) return '文本';
  return mime.split('/')[1]?.toUpperCase() || '未知';
}

/**
 * Image thumbnail with loading skeleton, fade-in, and error fallback.
 * Uses native <img> with loading="lazy" for efficient loading.
 */
function ImageThumbnail({ src, alt, priority }: { src: string; alt: string; priority?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => retryTimers.current.forEach(clearTimeout);
  }, []);

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500">
        <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-[10px]">加载失败</span>
      </div>
    );
  }

  const handleError = () => {
    if (retryCount < 2) {
      const delay = 500 * Math.pow(2, retryCount); // 500ms, 1000ms
      const timer = setTimeout(() => {
        setRetryCount(c => c + 1);
        setLoaded(false);
      }, delay);
      retryTimers.current.push(timer);
    } else {
      setError(true);
    }
  };

  return (
    <>
      {/* Shimmer placeholder — visible until image loads */}
      {!loaded && <div className="shimmer absolute inset-0 rounded-xl" />}
      <img
        key={retryCount}
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'low'}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={handleError}
      />
    </>
  );
}

/**
 * Video thumbnail with hover-to-preview.
 * Shows a poster image (from /thumb) if available; on hover, loads and plays the video muted.
 */
function VideoThumbnail({ src, path, isFirstRow }: { src: string; path: string; isFirstRow?: boolean }) {
  const [hovering, setHovering] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [posterLoaded, setPosterLoaded] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [touchPreview, setTouchPreview] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const posterUrl = getThumbUrl(path);

  useEffect(() => {
    if ((hovering || touchPreview) && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => { /* ignore autoplay block */ });
    } else if (!hovering && !touchPreview && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [hovering, touchPreview]);

  // On mobile, auto-stop preview after 2.5s to save bandwidth
  useEffect(() => {
    if (!touchPreview) return;
    touchTimerRef.current = setTimeout(() => {
      setTouchPreview(false);
    }, 2500);
    return () => {
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    };
  }, [touchPreview]);

  const handleTouchClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTouchPreview((v) => !v);
  };

  const hasPoster = posterLoaded && !posterFailed;

  return (
    <div
      className="w-full h-full relative"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Poster image (loaded from /thumb endpoint — custom or auto-generated) */}
      {!posterFailed && (
        <img
          src={posterUrl}
          alt=""
          loading={isFirstRow ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={isFirstRow ? 'high' : 'low'}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${hasPoster && !(hovering && videoLoaded) && !touchPreview ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setPosterLoaded(true)}
          onError={() => setPosterFailed(true)}
        />
      )}

      {/* Default play icon background (shown when no poster or video is playing) */}
      <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 text-white transition-opacity duration-300 ${hasPoster ? 'opacity-0' : hovering && videoLoaded ? 'opacity-0' : touchPreview ? 'opacity-0' : 'opacity-100'}`}>
        <svg className="w-12 h-12 text-white/60" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>

      {/* Video preview (loaded on hover/touch) */}
      {(hovering || touchPreview) && (
        <video
          ref={videoRef}
          src={src}
          muted
          loop
          playsInline
          preload="metadata"
          className={`video-preview video-preview-fade transition-opacity duration-300 ${videoLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoadedData={() => setVideoLoaded(true)}
        />
      )}

      {/* Mobile touch preview toggle button */}
      <button
        onClick={handleTouchClick}
        className="absolute inset-0 z-10 sm:hidden flex items-center justify-center"
        aria-label={touchPreview ? '停止预览' : '预览视频'}
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
          touchPreview
            ? 'bg-black/50 scale-90'
            : 'bg-black/40 hover:bg-black/50'
        }`}>
          {touchPreview ? (
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </div>
      </button>

      {/* VIDEO badge */}
      <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 text-[9px] font-medium bg-black/70 text-white rounded z-20">
        VIDEO
      </span>
    </div>
  );
}

/**
 * Virtualized file grid — only renders visible items for large galleries.
 * Inspired by Immich's virtual scroll pattern.
 */
function VirtualFileGrid({
  files, columns, visibleRange, totalHeight, offsetY, rowHeight, containerRef,
  selected, isSelectionMode, renaming, draggingFile, sortKey,
  onOpen, onSelect, onRename, setRenaming, setInternalSelected,
  handleCardClick, handleContextMenu, handleDragStart, handleDragEnd,
  touchLongPress, touchTargetRef,
  onLoadMore, hasMore, loadingMore, loadMoreError, search,
}: {
  files: FileItem[];
  columns: number;
  visibleRange: { start: number; end: number };
  totalHeight: number;
  offsetY: number;
  rowHeight: number;
  containerRef: React.RefObject<HTMLDivElement>;
  selected: Set<string>;
  isSelectionMode: boolean;
  renaming: { path: string; name: string } | null;
  draggingFile: string | null;
  sortKey: SortKey;
  onOpen: (path: string, mime: string) => void;
  onSelect?: (path: string) => void;
  onRename?: (path: string, name: string) => void;
  setRenaming: (r: { path: string; name: string } | null) => void;
  setInternalSelected: (fn: (prev: Set<string>) => Set<string>) => void;
  handleCardClick: (e: React.MouseEvent, path: string, mime: string) => void;
  handleContextMenu: (e: React.MouseEvent, path: string, name: string, isDir: boolean) => void;
  handleDragStart: (e: React.DragEvent, path: string) => void;
  handleDragEnd: () => void;
  touchLongPress: { onTouchStart: (e: React.TouchEvent) => void; onTouchMove: (e: React.TouchEvent) => void; onTouchEnd: (e: React.TouchEvent) => void };
  touchTargetRef: React.MutableRefObject<{ path: string; name: string; isDir: boolean } | null>;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  loadMoreError?: string | null;
  search?: string;
}) {
  const [preview, setPreview] = useState<{ file: FileItem; rect: DOMRect } | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ file: FileItem; rect: DOMRect } | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const gridRef = useRef<HTMLDivElement>(null);

  // Track visible file paths for keyboard navigation
  const visibleFiles = useMemo(() => files.slice(visibleRange.start, visibleRange.end), [files, visibleRange.start, visibleRange.end]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Don't navigate during rename
    if (renaming) return;

    const count = visibleFiles.length;
    if (count === 0) return;

    // Focus first item on initial keypress if nothing focused
    let idx = focusedIndex >= 0 && focusedIndex < count ? focusedIndex : (focusedIndex === -1 ? 0 : focusedIndex);

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        idx = Math.min(idx + 1, count - 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        idx = Math.max(idx - 1, 0);
        break;
      case 'ArrowDown':
        e.preventDefault();
        idx = Math.min(idx + columns, count - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        idx = Math.max(idx - columns, 0);
        break;
      case 'Home':
        e.preventDefault();
        idx = 0;
        break;
      case 'End':
        e.preventDefault();
        idx = count - 1;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (idx >= 0 && idx < count) {
          const file = visibleFiles[idx];
          if (e.key === 'Enter') {
            onOpen(file.path, file.mime);
          } else if (e.key === ' ') {
            // Space toggles selection (like clicking with selection mode)
            if (onSelect) {
              onSelect(file.path);
            } else {
              setInternalSelected((prev) => {
                const next = new Set(prev);
                if (next.has(file.path)) next.delete(file.path);
                else next.add(file.path);
                return next;
              });
            }
          }
        }
        return; // Don't proceed to focus
      default:
        return; // Ignore other keys
    }

    setFocusedIndex(idx);

    // Find the button element and focus it
    const buttons = gridRef.current?.querySelectorAll('button[data-file-idx]');
    if (buttons && buttons[idx]) {
      (buttons[idx] as HTMLElement).focus();
      // Scroll into view if not fully visible
      (buttons[idx] as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedIndex, columns, visibleFiles, renaming, onOpen, onSelect, setInternalSelected]);

  const handleMouseEnter = useCallback((e: React.MouseEvent, file: FileItem) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      if (file.mime.startsWith('image/')) {
        setPreview({ file, rect });
        setHoverInfo(null);
      } else {
        setHoverInfo({ file, rect });
        setPreview(null);
      }
    }, 300);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setPreview(null);
    setHoverInfo(null);
  }, []);

  // Reset focused index when visible files change (e.g. scroll, filter)
  useEffect(() => {
    setFocusedIndex(-1);
  }, [visibleFiles.length, columns]);

  // Infinite scroll sentinel — inside scroll container for proper IntersectionObserver behaviour
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sentinelRef.current || !onLoadMore || !hasMore || loadMoreError) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, loadMoreError]);

  return (
    <div
      ref={containerRef}
      className="overflow-auto min-h-0"
    >
      {/* Top spacer — maintains scroll position */}
      <div style={{ height: offsetY }} />

      <div
        ref={gridRef}
        className="grid gap-1 sm:gap-2"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        role="grid"
        aria-label="文件网格"
      >
        {visibleFiles.map((file, idx) => {
          const isImage = file.mime.startsWith('image/');
          const isVideo = file.mime.startsWith('video/');
          const isSelected = selected.has(file.path);
          const badge = getTypeBadge(file.mime);
          const extBadge = !isImage ? getExtBadge(file.name) : null;

          return (
            <button
              key={file.path}
              data-file-idx={idx}
              onClick={(e) => handleCardClick(e, file.path, file.mime)}
              onDoubleClick={() => onOpen(file.path, file.mime)}
              onContextMenu={(e) => handleContextMenu(e, file.path, file.name, false)}
              onTouchStart={(e) => {
                touchTargetRef.current = { path: file.path, name: file.name, isDir: false };
                touchLongPress.onTouchStart(e);
              }}
              onTouchMove={touchLongPress.onTouchMove}
              onTouchEnd={touchLongPress.onTouchEnd}
              onMouseEnter={(e) => handleMouseEnter(e, file)}
              onMouseLeave={handleMouseLeave}
              draggable={true}
              onDragStart={(e) => handleDragStart(e, file.path)}
              onDragEnd={handleDragEnd}
              className={`render-optimized flex flex-col items-center gap-1 sm:gap-2 p-1.5 sm:p-3 rounded-xl transition-all duration-150 group relative hover:scale-[1.03] hover:shadow-lg hover:z-10 hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-[0.97] active:bg-gray-100 dark:active:bg-gray-700 ${
                isSelected
                  ? 'bg-blue-100 dark:bg-blue-900/30 ring-2 ring-blue-500'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              } ${focusedIndex === idx ? 'outline-2 outline-blue-400/70 outline-offset-1' : ''} ${draggingFile === file.path ? 'opacity-40' : ''}`}
            >
              <div className={`w-full flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden relative ${localStorage.getItem('previewRatio') || 'aspect-square'}`}>
                {isImage ? (
                  <ImageThumbnail
                    src={getThumbUrl(file.path)}
                    alt={file.name}
                    priority={idx < columns}
                  />
                ) : isVideo ? (
                  <VideoThumbnail
                    src={getFileUrl(file.path)}
                    path={file.path}
                    isFirstRow={idx < columns}
                  />
                ) : (
                  <FileTypeIcon mime={file.mime} className="w-12 h-12" />
                )}

                {/* Type badge */}
                {!isImage && !isVideo && badge && (
                  <span className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded ${getBadgeColor(file.mime)}`}>
                    {badge}
                  </span>
                )}

                {/* Ext badge */}
                {!isImage && !isVideo && !badge && extBadge && (
                  <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded bg-gray-600/80 text-white">
                    {extBadge}
                  </span>
                )}

                {/* Selection checkbox */}
                <div
                  className={`absolute top-1.5 left-1.5 transition-opacity ${
                    isSelectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelect) {
                      onSelect(file.path);
                    } else {
                      setInternalSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(file.path)) next.delete(file.path);
                        else next.add(file.path);
                        return next;
                      });
                    }
                  }}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-blue-500 border-blue-500'
                      : 'bg-white/80 dark:bg-gray-800/80 border-gray-300 dark:border-gray-500 hover:border-blue-400'
                  }`}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>

              {renaming?.path === file.path ? (
                <input
                  autoFocus
                  defaultValue={renaming.name}
                  className="w-full text-xs text-center px-1 py-0.5 rounded border border-blue-500 outline-none"
                  onBlur={(e) => {
                    if (e.target.value && e.target.value !== renaming.name) {
                      onRename?.(file.path, e.target.value);
                    }
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="text-xs text-center truncate w-full group-hover:text-blue-500" title={file.name}>
                  <HighlightText text={getDisplayName(file.name)} searchTerm={search} />
                </span>
              )}
              <span className="text-[10px] text-gray-400">
                {formatSize(file.size)}
                {file.mtime > 0 && sortKey === 'mtime' && (
                  <span className="ml-1">{formatDate(file.mtime)}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bottom spacer */}
      <div style={{ height: Math.max(0, totalHeight - offsetY - (visibleFiles.length > 0 ? rowHeight : 0)) }} />

      {/* Infinite scroll sentinel — triggers load-more when scrolled into view */}
      {hasMore && onLoadMore && (
        <div ref={sentinelRef} className="flex items-center justify-center py-6">
          {loadingMore ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
              <span className="text-xs text-gray-400">已加载 {files.length} 个文件…</span>
            </div>
          ) : loadMoreError ? (
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs text-red-400">加载失败: {loadMoreError}</span>
              <button
                onClick={onLoadMore}
                className="px-3 py-1 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                点击重试
              </button>
            </div>
          ) : (
            <span className="text-xs text-gray-400">已加载 {files.length} 个文件，向下滚动加载更多</span>
          )}
        </div>
      )}

      {/* Hover preview popup — larger image on hover */}
      {preview && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: Math.min(preview.rect.left + preview.rect.width / 2 - 150, window.innerWidth - 320),
            top: Math.max(12, preview.rect.top - 220),
            width: 300,
            height: 200,
          }}
        >
          <div className="w-full h-full rounded-xl overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700 bg-black">
            <img
              src={getThumbUrl(preview.file.path)}
              alt={preview.file.name}
              className="w-full h-full object-contain"
              loading="lazy"
              decoding="async"
              fetchPriority="low"
            />
          </div>
          <div className="mt-1 text-center">
            <span className="text-[10px] text-gray-400 bg-black/60 px-2 py-0.5 rounded-full">
              {preview.file.name} · {formatSize(preview.file.size)}
            </span>
          </div>
        </div>
      )}

      {/* Hover info tooltip — file details for non-image items */}
      {hoverInfo && (
        <div
          className="fixed z-50 pointer-events-none bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-3 min-w-[180px] max-w-[260px]"
          style={{
            left: Math.min(hoverInfo.rect.left + hoverInfo.rect.width / 2 - 90, window.innerWidth - 200),
            top: Math.max(8, hoverInfo.rect.top - 120),
          }}
        >
          <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate mb-1.5">{hoverInfo.file.name}</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-gray-500 dark:text-gray-400">类型</span>
              <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">{getMimeLabel(hoverInfo.file.mime)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-gray-500 dark:text-gray-400">大小</span>
              <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">{formatSize(hoverInfo.file.size) || '-'}</span>
            </div>
            {hoverInfo.file.mtime > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] text-gray-500 dark:text-gray-400">日期</span>
                <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">
                  {new Date(hoverInfo.file.mtime * 1000).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FileGrid({ files, dirs, dirCounts, dirMtimes, currentDir, onNavigate, onOpen, onDelete, onRename, onMove, selected: externalSelected, onSelect, onLoadMore, hasMore, loadingMore, loadMoreError, sortBy, sortOrder, search }: Props) {
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; name: string; isDir: boolean } | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);
  const menuFocusIndex = useRef<number>(0);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  // Initialize sort from parent when provided, otherwise default to name/asc
  const [sortKey, setSortKey] = useState<SortKey>((sortBy as SortKey) || 'name');
  const [sortDir, setSortDir] = useState<SortDir>(sortOrder || 'asc');
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [draggingFile, setDraggingFile] = useState<string | null>(null);
  const [shareDialog, setShareDialog] = useState<{ path: string; name: string } | null>(null);
  const [folderPicker, setFolderPicker] = useState<{ mode: 'move' | 'copy'; path: string } | null>(null);
  // Anchor for Shift+click range selection — stores the path of the last manually-selected item
  const selectionAnchorRef = useRef<string | null>(null);

  // Folder thumbnail images
  const folderThumbs = useFolderThumbnails(dirs, currentDir);

  // Virtual scroll for files — only render visible items (reference sortedFiles below)
  const fileCount = Object.keys(files).length;
  const virtualGrid = useVirtualGrid({
    itemCount: fileCount,
    minColumnWidth: 200,
    rowHeight: 280,
    gap: 12,
    overscan: 2,
  });

  // Sync local sort state when parent sortBy/sortOrder changes (from Header)
  useEffect(() => {
    if (sortBy && ['name', 'size', 'mtime', 'kind', 'shuffle'].includes(sortBy)) {
      setSortKey(sortBy as SortKey);
    }
    if (sortOrder === 'asc' || sortOrder === 'desc') {
      setSortDir(sortOrder);
    }
  }, [sortBy, sortOrder]);

  // Close context menu on Escape key
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [contextMenu]);

  // Context menu: keyboard navigation (ArrowUp/Down, Enter, Tab)
  useEffect(() => {
    if (!contextMenu) {
      menuFocusIndex.current = 0;
      return;
    }

    const buttons = () => contextMenuRef.current?.querySelectorAll('button:not([disabled])') ?? [];
    let justOpened = true;

    const onKeyDown = (e: KeyboardEvent) => {
      const items = buttons();
      if (items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(menuFocusIndex.current + 1, items.length - 1);
        menuFocusIndex.current = next;
        (items[next] as HTMLElement)?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = Math.max(menuFocusIndex.current - 1, 0);
        menuFocusIndex.current = prev;
        (items[prev] as HTMLElement)?.focus();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          const prev = Math.max(menuFocusIndex.current - 1, 0);
          menuFocusIndex.current = prev;
          (items[prev] as HTMLElement)?.focus();
        } else {
          const next = Math.min(menuFocusIndex.current + 1, items.length - 1);
          menuFocusIndex.current = next;
          (items[next] as HTMLElement)?.focus();
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        // Let the button's onClick fire naturally, no extra action needed
      }
    };

    // Focus first item on open (after render)
    requestAnimationFrame(() => {
      menuFocusIndex.current = 0;
      const first = buttons()[0];
      if (first && justOpened) {
        justOpened = false;
        (first as HTMLElement).focus();
      }
    });

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [contextMenu]);

  // Context menu: adjust position to avoid viewport overflow
  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const menu = contextMenuRef.current;
    const rect = menu.getBoundingClientRect();

    let left = contextMenu.x;
    let top = contextMenu.y;

    if (left + rect.width > window.innerWidth - 8) {
      left = window.innerWidth - rect.width - 8;
    }
    if (left < 8) left = 8;

    if (top + rect.height > window.innerHeight - 8) {
      top = window.innerHeight - rect.height - 8;
    }
    if (top < 8) top = 8;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }, [contextMenu]);

  // FileGrid ref for drag event data (reused in VirtualFileGrid above)
  // Note: VirtualFileGrid handles its own IntersectionObserver-based infinite scroll sentinel

  // Use external selection state when provided, otherwise use internal
  const selected = externalSelected ?? internalSelected;
  const isSelectionMode = selected.size > 0;

  const setSelected = (fn: (prev: Set<string>) => Set<string>) => {
    if (externalSelected !== undefined && onSelect) {
      // In external mode, we need parent to handle state
      // We'll call onSelect for individual toggles
      return;
    }
    setInternalSelected(fn);
  };

  // Build and sort items (memoized to avoid re-sorting on unrelated re-renders)
  const sortedDirs = useMemo(() => {
    const dirItems = dirs.map((name) => ({
      name,
      type: 'directory' as const,
      size: 0,
      mime: 'directory',
      mtime: dirMtimes?.[name] ?? 0,
      path: currentDir ? `${currentDir}/${name}` : name,
    }));
    return [...dirItems].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'mtime') cmp = a.mtime - b.mtime;
      else if (sortKey === 'size') cmp = a.name.localeCompare(b.name); // dirs have size=0, fall back to name
      else if (sortKey === 'shuffle') cmp = seededHash(a.name) - seededHash(b.name);
      else if (sortKey === 'kind') cmp = getKindOrder(a.mime) - getKindOrder(b.mime) || a.name.localeCompare(b.name);
      else cmp = a.name.localeCompare(b.name); // 'name' and default
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [dirs, currentDir, sortKey, sortDir, dirMtimes]);

  const sortedFiles = useMemo(() => {
    const fileItems = Object.values(files);
    return [...fileItems].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'size') cmp = a.size - b.size;
      else if (sortKey === 'mtime') cmp = a.mtime - b.mtime;
      else if (sortKey === 'kind') cmp = getKindOrder(a.mime) - getKindOrder(b.mime) || a.name.localeCompare(b.name);
      else if (sortKey === 'shuffle') cmp = seededHash(a.name) - seededHash(b.name);
      else cmp = a.mtime - b.mtime;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [files, sortKey, sortDir]);

  // Ctrl+A — select all items; Escape — clear selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+A / Cmd+A — select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        // Don't intercept when user is typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        const allPaths = [...sortedDirs.map(d => d.path), ...sortedFiles.map(f => f.path)];
        if (onSelect) {
          allPaths.forEach(p => onSelect(p));
        } else {
          setInternalSelected(new Set(allPaths));
        }
        return;
      }
      // Escape — clear selection
      if (e.key === 'Escape' && selected.size > 0) {
        // Don't clear if context menu is open — that's handled separately
        if (contextMenu) return;
        if (onSelect) {
          selected.forEach(p => onSelect(p)); // Let parent clear
        } else {
          setInternalSelected(new Set());
        }
        selectionAnchorRef.current = null;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sortedDirs, sortedFiles, selected, onSelect, contextMenu]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, filePath: string) => {
    e.dataTransfer.setData('text/plain', filePath);
    e.dataTransfer.effectAllowed = 'copyMove';
    setDraggingFile(filePath);
  };

  const handleDragEnd = () => {
    setDraggingFile(null);
    setDragOverFolder(null);
  };

  const handleDragOverFolder = (e: React.DragEvent, folderPath: string) => {
    e.preventDefault();
    // Show copy indicator when Ctrl is held
    e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
    setDragOverFolder(folderPath);
  };

  const handleDragLeaveFolder = () => {
    setDragOverFolder(null);
  };

  const handleDropOnFolder = async (e: React.DragEvent, folderPath: string) => {
    e.preventDefault();
    setDragOverFolder(null);
    setDraggingFile(null);

    const fromPath = e.dataTransfer.getData('text/plain');
    if (!fromPath || fromPath === folderPath) return;

    const isCopy = e.ctrlKey || e.metaKey;

    // Don't allow dropping a folder into itself or its children
    if (folderPath.startsWith(fromPath + '/')) return;

    try {
      const result = isCopy
        ? await copyFile(fromPath, folderPath)
        : await moveItem(fromPath, folderPath);
      if (result.success) {
        toast('success', isCopy ? '复制成功' : '移动成功');
        onMove?.();
      }
    } catch (err) {
      console.error(`${isCopy ? 'Copy' : 'Move'} failed:`, err);
      toast('error', `${isCopy ? '复制' : '移动'}失败`);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, path: string, name: string, isDir: boolean) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, path, name, isDir });
  };

  // Ref to hold context menu target data for touch long-press
  const touchTargetRef = useRef<{ path: string; name: string; isDir: boolean } | null>(null);
  const touchLongPress = useLongPress((clientX, clientY) => {
    if (touchTargetRef.current) {
      setContextMenu({ x: clientX, y: clientY, ...touchTargetRef.current });
      touchTargetRef.current = null;
    }
  }, []);

  const handleCardClick = (e: React.MouseEvent, path: string, mime: string) => {
    // Shift+click — range selection: select all items between anchor and clicked item
    if (e.shiftKey) {
      e.preventDefault();
      const anchor = selectionAnchorRef.current;
      if (anchor && anchor !== path) {
        // Find indices in sortedFiles + sortedDirs combined order
        const allItems = [...sortedDirs.map(d => ({ name: d.name, path: d.path })), ...sortedFiles.map(f => ({ name: f.name, path: f.path }))];
        const anchorIdx = allItems.findIndex(i => i.path === anchor);
        const clickIdx = allItems.findIndex(i => i.path === path);
        if (anchorIdx >= 0 && clickIdx >= 0) {
          const [start, end] = anchorIdx < clickIdx ? [anchorIdx, clickIdx] : [clickIdx, anchorIdx];
          const rangePaths = allItems.slice(start, end + 1).map(i => i.path);
          if (onSelect) {
            rangePaths.forEach(p => onSelect(p));
          } else {
            setInternalSelected((prev) => {
              const next = new Set(prev);
              rangePaths.forEach(p => next.add(p));
              return next;
            });
          }
          return;
        }
      }
      // Fallback: if no anchor or anchor not found, toggle single item
      if (onSelect) {
        onSelect(path);
      } else {
        setInternalSelected((prev) => {
          const next = new Set(prev);
          if (next.has(path)) next.delete(path);
          else next.add(path);
          return next;
        });
      }
      return;
    }
    // If selection mode is active, toggle individual item and update anchor
    if (isSelectionMode) {
      e.preventDefault();
      selectionAnchorRef.current = path;
      if (onSelect) {
        onSelect(path);
      } else {
        setInternalSelected((prev) => {
          const next = new Set(prev);
          if (next.has(path)) next.delete(path);
          else next.add(path);
          return next;
        });
      }
      return;
    }
    // Ctrl/Meta + click — add to selection and set anchor
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      selectionAnchorRef.current = path;
      if (onSelect) {
        onSelect(path);
      } else {
        setInternalSelected((prev) => {
          const next = new Set(prev);
          next.add(path);
          return next;
        });
      }
      return;
    }
    // Normal click — open in lightbox
    const isImage = mime.startsWith('image/');
    const isVideo = mime.startsWith('video/');
    const isAudio = mime.startsWith('audio/');
    const isPdf = mime === 'application/pdf';
    const isText = mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml' || mime === 'application/javascript';
    const isOffice = mime.includes('word') || mime.includes('document') || mime.includes('sheet') || mime.includes('excel') || mime.includes('presentation') || mime.includes('powerpoint');
    if (isImage || isVideo || isAudio || isPdf || isText || isOffice) {
      onOpen(path, mime);
    }
  };

  const SortIndicator = ({ active, dir }: { active: boolean; dir: SortDir }) => (
    <svg className={`w-3 h-3 ml-0.5 inline transition-colors ${active ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`} fill="currentColor" viewBox="0 0 20 20">
      <path d={dir === 'asc' ? 'M5 10l5-5 5 5' : 'M5 10l5 5 5-5'} />
    </svg>
  );

  return (
    <>
      {/* Sort controls bar */}
      {(dirs.length > 0 || Object.keys(files).length > 0) && (
        <div className="flex items-center gap-1 mb-3 text-xs">
          <span className="text-gray-400 dark:text-gray-500 mr-1">排序:</span>
          {(['name', 'size', 'mtime', 'kind', 'shuffle'] as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => toggleSort(key)}
              className={`px-2 py-1 rounded-md transition-colors ${
                sortKey === key
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {key === 'name' ? '名称' : key === 'size' ? '大小' : key === 'mtime' ? '时间' : key === 'kind' ? '类型' : '随机'}
              {sortKey === key && <SortIndicator active dir={sortDir} />}
            </button>
          ))}
          <span className="text-gray-400 dark:text-gray-500 ml-auto">
            {dirs.length > 0 && `${dirs.length} 个文件夹`}
            {dirs.length > 0 && Object.keys(files).length > 0 && ' · '}
            {Object.keys(files).length > 0 && `${Object.keys(files).length} 个文件`}
          </span>
        </div>
      )}

      {/* Directories */}
      {sortedDirs.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">文件夹</h3>
          <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-1.5 sm:gap-3">
            {sortedDirs.map((item) => (
              <button
                key={item.path}
                onClick={() => onNavigate(item.path)}
                onContextMenu={(e) => handleContextMenu(e, item.path, item.name, true)}
                onTouchStart={(e) => {
                  touchTargetRef.current = { path: item.path, name: item.name, isDir: true };
                  touchLongPress.onTouchStart(e);
                }}
                onTouchMove={touchLongPress.onTouchMove}
                onTouchEnd={touchLongPress.onTouchEnd}
                onDragOver={(e) => handleDragOverFolder(e, item.path)}
                onDragLeave={handleDragLeaveFolder}
                onDrop={(e) => handleDropOnFolder(e, item.path)}
                className={`flex flex-col items-center gap-1 sm:gap-2 p-2 sm:p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors transition-transform duration-100 group render-optimized active:scale-[0.97] active:bg-gray-100 dark:active:bg-gray-700 ${
                  dragOverFolder === item.path
                    ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/30 scale-[1.02]'
                    : ''
                }`}
              >
                <div className="w-full aspect-square flex items-center justify-center bg-yellow-50 dark:bg-yellow-900/20 rounded-xl overflow-hidden relative">
                  {folderThumbs[item.path] ? (
                    <>
                      <img
                        src={folderThumbs[item.path]}
                        alt=""
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                        loading="lazy"
                        decoding="async"
                        fetchPriority="low"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <FileTypeIcon mime="folder" className="w-8 h-8" isDir={true} />
                      </div>
                    </>
                  ) : (
                    <FileTypeIcon mime="folder" className="w-8 h-8" isDir={true} />
                  )}
                  {dirCounts && dirCounts[item.name] !== undefined && (
                    <span className="absolute top-1 right-1 text-[10px] leading-none font-medium bg-blue-500/90 text-white px-1.5 py-1 rounded-full shadow-sm backdrop-blur-sm">
                      {dirCounts[item.name]}
                    </span>
                  )}
                </div>
                <span className="text-xs text-center truncate w-full group-hover:text-blue-500">{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Files — virtualized for large galleries (Immich-inspired) */}
      {sortedFiles.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">文件</h3>
          <VirtualFileGrid
            files={sortedFiles}
            columns={virtualGrid.columns}
            visibleRange={virtualGrid.visibleRange}
            totalHeight={virtualGrid.totalHeight}
            offsetY={virtualGrid.offsetY}
            rowHeight={virtualGrid.rowHeight}
            containerRef={virtualGrid.containerRef}
            selected={selected}
            isSelectionMode={isSelectionMode}
            renaming={renaming}
            draggingFile={draggingFile}
            sortKey={sortKey}
            onOpen={onOpen}
            onSelect={onSelect}
            onRename={onRename}
            setRenaming={setRenaming}
            setInternalSelected={setInternalSelected}
            handleCardClick={handleCardClick}
            handleContextMenu={handleContextMenu}
            handleDragStart={handleDragStart}
            handleDragEnd={handleDragEnd}
            touchLongPress={touchLongPress}
            touchTargetRef={touchTargetRef}
            onLoadMore={onLoadMore}
            hasMore={hasMore}
            loadingMore={loadingMore}
            loadMoreError={loadMoreError}
            search={search}
          />
        </div>
      )}

      {/* Empty state */}
      {sortedDirs.length === 0 && sortedFiles.length === 0 && (
        <EmptyState type="directory" />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            ref={contextMenuRef}
            className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[180px]"
            role="menu"
            aria-label="右键菜单"
          >
            {!contextMenu.isDir && (
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = getFileUrl(contextMenu.path) + '&download=1';
                  a.download = contextMenu.name;
                  a.click();
                  setContextMenu(null);
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                下载
              </button>
            )}
            {!contextMenu.isDir && (
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                onClick={() => {
                  window.open(getFileUrl(contextMenu.path), '_blank');
                  setContextMenu(null);
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                在新标签页中打开
              </button>
            )}
            {!contextMenu.isDir && contextMenu.name.toLowerCase().endsWith('.url') && (
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-blue-600 dark:text-blue-400"
                onClick={async () => {
                  try {
                    const { url } = await getUrlContent(contextMenu.path);
                    if (url) window.open(url, '_blank');
                    toast('success', '链接已打开');
                  } catch (e) { toast('error', '打开链接失败'); }
                  setContextMenu(null);
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                打开链接
              </button>
            )}
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${window.location.origin}/view/${encodeURIComponent(contextMenu.path)}`);
                  toast('success', '链接已复制');
                } catch (_e) { toast('error', '复制失败'); }
                setContextMenu(null);
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
              复制链接
            </button>
            {!contextMenu.isDir && (
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`${window.location.origin}/api/file?path=${encodeURIComponent(contextMenu.path)}`);
                    toast('success', '直链已复制');
                  } catch (_e) { toast('error', '复制失败'); }
                  setContextMenu(null);
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                复制直链
              </button>
            )}
            {!contextMenu.isDir && (
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(contextMenu.name);
                    toast('success', '文件名已复制');
                  } catch (_e) { toast('error', '复制失败'); }
                  setContextMenu(null);
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                复制文件名
              </button>
            )}
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(contextMenu.path);
                  toast('success', '路径已复制');
                } catch (_e) { toast('error', '复制失败'); }
                setContextMenu(null);
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
              复制路径
            </button>
            {!contextMenu.isDir && (
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                onClick={async () => {
                  try {
                    const result = await duplicateFile(contextMenu.path);
                    if (result.success) { toast('success', `已复制到 ${result.newPath}`); onMove?.(); }
                  } catch (e) { toast('error', `复制失败: ${(e as Error).message}`); }
                  setContextMenu(null);
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                复制文件
              </button>
            )}
            {/* Move to */}
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              onClick={() => { setFolderPicker({ mode: 'move', path: contextMenu.path }); setContextMenu(null); }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
              移动到...
            </button>
            {/* Copy to */}
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              onClick={() => { setFolderPicker({ mode: 'copy', path: contextMenu.path }); setContextMenu(null); }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              复制到...
            </button>
            {/* Folder download as ZIP */}
            {contextMenu.isDir && (
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                onClick={async () => {
                  toast('info', '正在打包下载...');
                  try {
                    await downloadZip([contextMenu.path]);
                    toast('success', 'ZIP 下载已开始');
                  } catch (e) { toast('error', `下载失败: ${(e as Error).message}`); }
                  setContextMenu(null);
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                下载为 ZIP
              </button>
            )}
            {/* Unzip */}
            {!contextMenu.isDir && contextMenu.name.endsWith('.zip') && (
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                onClick={async () => {
                  toast('info', '正在解压...');
                  try {
                    const { unzipFile } = await import('../api');
                    const result = await unzipFile(contextMenu.path, currentDir);
                    toast('success', `已解压 ${result.extracted} 个文件到 ${result.dir}`);
                    onMove?.();
                  } catch (e) { toast('error', `解压失败: ${(e as Error).message}`); }
                  setContextMenu(null);
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                解压到...
              </button>
            )}
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              onClick={() => { setRenaming({ path: contextMenu.path, name: contextMenu.name }); setContextMenu(null); }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              重命名
            </button>
            {!contextMenu.isDir && (
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                onClick={() => { setShareDialog({ path: contextMenu.path, name: contextMenu.name }); setContextMenu(null); }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                分享
              </button>
            )}
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500 flex items-center gap-2"
              onClick={() => { onDelete?.([contextMenu.path]); setContextMenu(null); }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              删除
            </button>
          </div>
        </>
      )}
      {shareDialog && (
        <ShareDialog filePath={shareDialog.path} fileName={shareDialog.name} onClose={() => setShareDialog(null)} />
      )}
      {folderPicker && (
        <Suspense fallback={null}>
          <FolderPicker
            title={folderPicker.mode === 'move' ? '移动到' : '复制到'}
            onSelect={async (target) => {
              try {
                if (folderPicker.mode === 'move') {
                  await moveItem(folderPicker.path, target);
                  toast('success', '移动成功');
                } else {
                  await copyFile(folderPicker.path, target);
                  toast('success', '复制成功');
                }
                onMove?.();
              } catch (e) {
                toast('error', `${folderPicker.mode === 'move' ? '移动' : '复制'}失败: ${(e as Error).message}`);
              }
              setFolderPicker(null);
            }}
            onClose={() => setFolderPicker(null)}
          />
        </Suspense>
      )}
    </>
  );
}
