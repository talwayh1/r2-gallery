import { useState, useEffect, useRef } from 'react';
import type { FileItem } from '../types';
import { getThumbUrl, getFileUrl } from '../api';

interface Props {
  files: Record<string, FileItem>;
  dirs: string[];
  currentDir: string;
  onNavigate: (path: string) => void;
  onOpen: (path: string, mime: string) => void;
  onDelete?: (paths: string[]) => void;
  onRename?: (path: string, name: string) => void;
  selected?: Set<string>;
  onSelect?: (path: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}

function formatSize(bytes: number) {
  if (bytes === 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(ts: number) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleDateString();
}

export default function FileImageList({ files, dirs, currentDir, onNavigate, onOpen, onDelete, onRename, selected: externalSelected, onSelect, onLoadMore, hasMore, loadingMore }: Props) {
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; name: string; isDir: boolean } | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);

  const selected = externalSelected ?? internalSelected;
  const isSelectionMode = selected.size > 0;

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sentinelRef.current || !onLoadMore || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) onLoadMore(); },
      { rootMargin: '400px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore]);

  const dirItems = dirs.map((name) => ({
    name, type: 'directory' as const, size: 0, mime: 'directory', mtime: 0,
    path: currentDir ? `${currentDir}/${name}` : name,
  }));
  const fileItems = Object.values(files);
  const allItems = [...dirItems, ...fileItems];

  const handleToggleSelect = (path: string) => {
    if (onSelect) { onSelect(path); return; }
    setInternalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  return (
    <>
      <div className="space-y-2">
        {allItems.map((item) => {
          const isDir = item.type === 'directory';
          const isSelected = selected.has(item.path);
          const isImage = item.mime.startsWith('image/');
          const isVideo = item.mime.startsWith('video/');

          return (
            <div
              key={item.path}
              className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-colors ${
                isSelected ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-500' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              onClick={() => isDir ? onNavigate(item.path) : onOpen(item.path, item.mime)}
              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, path: item.path, name: item.name, isDir }); }}
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
                  <div className="w-full h-full flex items-center justify-center text-2xl">📁</div>
                ) : isImage ? (
                  <img src={getThumbUrl(item.path)} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : isVideo ? (
                  <div className="w-full h-full flex items-center justify-center bg-gray-800 text-white">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl">📄</div>
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
                  <div className="font-medium text-sm truncate">{item.name.endsWith('.url') ? item.name.slice(0, -4) : item.name}</div>
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

      {hasMore && (
        <div ref={sentinelRef} className="flex items-center justify-center py-8">
          {loadingMore ? <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" /> : <span className="text-sm text-gray-400">滚动加载更多…</span>}
        </div>
      )}

      {allItems.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
          <p className="text-lg font-medium">暂无文件</p>
        </div>
      )}

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => { setRenaming({ path: contextMenu.path, name: contextMenu.name }); setContextMenu(null); }}>重命名</button>
            <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500" onClick={() => { onDelete?.([contextMenu.path]); setContextMenu(null); }}>删除</button>
          </div>
        </>
      )}
    </>
  );
}
