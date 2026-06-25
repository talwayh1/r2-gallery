import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import type { FileItem } from '../types';
import { getFileUrl, getThumbUrl, duplicateFile, downloadZip, moveItem, copyFile } from '../api';
import { toast } from '../hooks/useToast';
import SafeThumb from './SafeThumb';
import FileTypeIcon from './FileTypeIcon';
import EmptyState from './EmptyState';
import { formatSize, formatDate, getKindOrder } from '../utils';
import HighlightText from './HighlightText';
import { useVirtualList } from '../hooks/useVirtualList';

const FolderPicker = lazy(() => import('./FolderPicker'));
const ShareDialog = lazy(() => import('./ShareDialog'));

interface Props {
  files: Record<string, FileItem>;
  dirs: string[];
  dirMtimes?: Record<string, number>;
  currentDir: string;
  onNavigate: (path: string) => void;
  onOpen: (path: string, mime: string) => void;
  onDelete?: (paths: string[]) => void;
  onRename?: (path: string, name: string) => void;
  onMove?: () => void;
  onLoadMore?: () => void;
  selected?: Set<string>;
  onSelect?: (path: string) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}


/**
 * Video thumbnail for list views — loads poster image from /api/thumb.
 * Falls back to a play icon if the poster fails to load.
 */
function VideoListThumb({ path, mtime }: { path: string; mtime?: number }) {
  const [posterFailed, setPosterFailed] = useState(false);
  const posterUrl = getThumbUrl(path, mtime);

  if (posterFailed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-800 text-white">
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <img
        src={posterUrl}
        alt=""
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        className="w-full h-full object-cover"
        onError={() => setPosterFailed(true)}
      />
      {/* Play icon overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
        <svg className="w-5 h-5 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
  );
}

export default function FileImageList({ files, dirs, dirMtimes, currentDir, onNavigate, onOpen, onDelete, onRename, onMove, onLoadMore, selected: externalSelected, onSelect, hasMore, loadingMore, sortBy: sortByProp, sortOrder: sortOrderProp, search }: Props) {
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; name: string; isDir: boolean } | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const menuFocusIndex = useRef<number>(0);
  const [shareDialog, setShareDialog] = useState<{ path: string; name: string } | null>(null);
  const [folderPicker, setFolderPicker] = useState<{ mode: 'move' | 'copy'; path: string } | null>(null);

  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const selected = externalSelected ?? internalSelected;
  const isSelectionMode = selected.size > 0;

  // Long-press for mobile context menu
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPos = useRef<{ x: number; y: number } | null>(null);
  const longPressCancelled = useRef(false);
  const longPressTarget = useRef<{ path: string; name: string; isDir: boolean } | null>(null);

  const clearLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    longPressPos.current = null;
    longPressCancelled.current = false;
    longPressTarget.current = null;
  };

  const handleTouchStart = (e: React.TouchEvent, path: string, name: string, isDir: boolean) => {
    clearLongPress();
    const touch = e.touches[0];
    longPressPos.current = { x: touch.clientX, y: touch.clientY };
    longPressTarget.current = { path, name, isDir };
    longPressCancelled.current = false;
    longPressTimer.current = setTimeout(() => {
      if (!longPressCancelled.current && longPressPos.current && longPressTarget.current) {
        setContextMenu({ x: longPressPos.current.x, y: longPressPos.current.y, ...longPressTarget.current });
      }
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!longPressPos.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - longPressPos.current.x);
    const dy = Math.abs(touch.clientY - longPressPos.current.y);
    if (dx > 15 || dy > 15) { longPressCancelled.current = true; clearLongPress(); }
  };

  const handleTouchEnd = () => { longPressCancelled.current = true; clearLongPress(); };

  const sentinelRef = useRef<HTMLDivElement>(null);
  // Use a ref for onLoadMore to avoid observer re-creation when the parent's
  // loadingMore state toggles (which changes onLoadMore's identity via useCallback).
  // Pattern from FileGrid — keeps the observer stable and prevents duplicate API calls.
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;
  useEffect(() => {
    if (!sentinelRef.current || !onLoadMoreRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) onLoadMoreRef.current?.(); },
      { rootMargin: '400px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore]); // Intentionally omit onLoadMore — ref avoids observer re-creation

  // Client-side sort
  const sortKey: 'name' | 'size' | 'mtime' | 'kind' | 'shuffle' = (['name', 'size', 'mtime', 'kind', 'shuffle'].includes(sortByProp ?? '') ? sortByProp! : 'name') as 'name' | 'size' | 'mtime' | 'kind' | 'shuffle';
  const sortDir: 'asc' | 'desc' = sortOrderProp || 'asc';

  const sortedItems = useMemo(() => {
    const dirItems = dirs.map((name) => ({
      name, type: 'directory' as const, size: 0, mime: 'directory',
      mtime: dirMtimes?.[name] ?? 0,
      path: currentDir ? `${currentDir}/${name}` : name,
    }));
    const fileItems = Object.values(files);
    const allItems = [...dirItems, ...fileItems];
    return allItems.sort((a, b) => {
      // Directories always come first
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === 'size') {
        cmp = a.size - b.size;
      } else if (sortKey === 'mtime') {
        cmp = (a.mtime || 0) - (b.mtime || 0);
      } else if (sortKey === 'kind') {
        cmp = getKindOrder(a.mime) - getKindOrder(b.mime);
      } else if (sortKey === 'shuffle') {
        cmp = Math.random() - 0.5;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [dirs, files, currentDir, sortKey, sortDir, dirMtimes]);

  // Virtual scrolling — only render visible items in list view
  // Must be declared after sortedItems to avoid TDZ
  const { containerRef, visibleRange, totalHeight, offsetY } = useVirtualList({
    itemCount: sortedItems.length,
    rowHeight: 96,
  });

  // Keyboard navigation for FileImageList — refs avoid stale closures and
  // unnecessary event listener re-registration on every keypress (focusedIndex
  // changes on every arrow press; sortedItems changes on every API response).
  const focusedIndexRef = useRef(focusedIndex);
  focusedIndexRef.current = focusedIndex;
  const sortedItemsRef = useRef(sortedItems);
  sortedItemsRef.current = sortedItems;
  const itemsLengthRef = useRef(sortedItems.length);
  itemsLengthRef.current = sortedItems.length;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when the inline rename input is active
      if (renaming) return;

      const len = itemsLengthRef.current;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = Math.min(prev + 1, len - 1);
          return prev < 0 ? 0 : next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setFocusedIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setFocusedIndex(len - 1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        const fi = focusedIndexRef.current;
        if (fi >= 0 && fi < len) {
          e.preventDefault();
          const item = sortedItemsRef.current[fi];
          if (item) {
            item.type === 'directory' ? onNavigate(item.path) : onOpen(item.path, item.mime);
          }
        }
      }
    };

    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [renaming, onNavigate, onOpen]);

  // Auto-scroll focused item into view
  useEffect(() => {
    if (focusedIndex < 0 || !containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-item-index="${focusedIndex}"]`);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedIndex]);

  const handleToggleSelect = (path: string) => {
    if (onSelect) { onSelect(path); return; }
    setInternalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const handleContextMenu = (e: React.MouseEvent, path: string, name: string, isDir: boolean) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, path, name, isDir });
  };

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
      }
    };
    requestAnimationFrame(() => {
      menuFocusIndex.current = 0;
      const first = buttons()[0];
      if (first && justOpened) {
        justOpened = false;
        (first as HTMLElement).focus();
      }
      const menu = contextMenuRef.current;
      if (!menu) return;
      const rect = menu.getBoundingClientRect();
      let left = contextMenu.x;
      let top = contextMenu.y;
      if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
      if (left < 8) left = 8;
      if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8;
      if (top < 8) top = 8;
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    });
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [contextMenu]);

  return (
    <>
      <div
        ref={containerRef}
        tabIndex={0}
        className="overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 rounded-lg"
        style={{ position: 'relative', height: '100%', scrollbarGutter: 'stable' }}
        onMouseMove={() => focusedIndex >= 0 && setFocusedIndex(-1)}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetY}px)`, willChange: 'transform' }}>
            {sortedItems.slice(visibleRange.start, visibleRange.end).map((item, virtualIndex) => {
              const index = visibleRange.start + virtualIndex;
              const isDir = item.type === 'directory';
              const isSelected = selected.has(item.path);
              const isImage = item.mime.startsWith('image/');
              const isVideo = item.mime.startsWith('video/');

              return (
                <div
                  key={item.path}
                  data-item-index={index}
                  className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-colors render-optimized ${
                    isSelected ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-500' : focusedIndex === index ? 'bg-blue-50/50 dark:bg-blue-900/20 ring-1 ring-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                  onClick={() => isDir ? onNavigate(item.path) : onOpen(item.path, item.mime)}
                  onContextMenu={(e) => handleContextMenu(e, item.path, item.name, isDir)}
                  onTouchStart={(e) => handleTouchStart(e, item.path, item.name, isDir)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <div
                    className="flex-shrink-0"
                    onClick={(e) => { e.stopPropagation(); handleToggleSelect(item.path); }}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="w-16 h-16 flex-shrink-0 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                    {isDir ? (
                      <FileTypeIcon mime="folder" className="w-8 h-8" isDir={true} />
                    ) : isImage ? (
                      <SafeThumb path={item.path} mtime={item.mtime} />
                    ) : isVideo ? (
                      <VideoListThumb path={item.path} mtime={item.mtime} />
                    ) : (
                      <FileTypeIcon mime="application/octet-stream" className="w-8 h-8" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {renaming?.path === item.path ? (
                      <input
                        autoFocus
                        defaultValue={renaming.name}
                        className="w-full text-sm px-2 py-1 rounded border border-blue-500 outline-none"
                        onBlur={(e) => {
                          if (e.target.value && e.target.value !== renaming.name) onRename?.(item.path, e.target.value);
                          setRenaming(null);
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null); }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="font-medium text-sm truncate">
                        <HighlightText text={item.name.endsWith('.url') ? item.name.slice(0, -4) : item.name} searchTerm={search} />
                      </div>
                    )}
                    <div className="text-xs text-gray-500">
                      {isDir ? '文件夹' : formatSize(item.size)}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 flex-shrink-0">
                    {formatDate(item.mtime)}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Infinite scroll sentinel — inside scroll container so it triggers correctly */}
          {hasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center py-8">
              {loadingMore ? <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" /> : <span className="text-sm text-gray-400">滚动加载更多…</span>}
            </div>
          )}
        </div>
      </div>

      {sortedItems.length === 0 && (
        <EmptyState type="directory" />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            ref={contextMenuRef}
            role="menu"
            aria-label="右键菜单"
            className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[180px] max-h-[85vh] overflow-y-auto"
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
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
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
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              onClick={() => { setRenaming({ path: contextMenu.path, name: contextMenu.name }); setContextMenu(null); }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              重命名
            </button>
            {onDelete && (
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-red-500"
                onClick={async () => {
                  const confirmed = window.confirm(`确定要删除「${contextMenu.name}」吗？`);
                  if (confirmed) {
                    try { await onDelete([contextMenu.path]); toast('success', '已删除'); setContextMenu(null); onMove?.(); }
                    catch (e) { toast('error', `删除失败: ${(e as Error).message}`); }
                  }
                  setContextMenu(null);
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                删除
              </button>
            )}
          </div>
        </>
      )}

      {shareDialog && (
        <Suspense fallback={null}>
          <ShareDialog filePath={shareDialog.path} fileName={shareDialog.name} onClose={() => setShareDialog(null)} />
        </Suspense>
      )}
      {folderPicker && (
        <Suspense fallback={null}>
          <FolderPicker
            title={folderPicker.mode === 'move' ? '移动到' : '复制到'}
            onSelect={async (target: string) => {
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
