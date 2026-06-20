import { useState, useEffect, useRef } from 'react';
import type { FileItem } from '../types';
import { useFolderThumbnails } from '../hooks/useFolderThumbnails';
import SafeThumb from './SafeThumb';
import FileTypeIcon from './FileTypeIcon';

interface Props {
  files: Record<string, FileItem>;
  dirs: string[];
  currentDir: string;
  onNavigate: (path: string) => void;
  onOpen: (path: string, mime: string) => void;
  onDelete?: (paths: string[]) => void;
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

export default function FileColumns({ files, dirs, currentDir, onNavigate, onOpen, onDelete, selected: externalSelected, onSelect, onLoadMore, hasMore, loadingMore }: Props) {
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const folderThumbs = useFolderThumbnails(dirs, currentDir);

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
      <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-4 space-y-4">
        {allItems.map((item) => {
          const isDir = item.type === 'directory';
          const isImage = item.mime.startsWith('image/');
          const isVideo = item.mime.startsWith('video/');
          const isSelected = selected.has(item.path);

          return (
            <div
              key={item.path}
              className={`break-inside-avoid rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer transition-all relative ${
                isSelected ? 'ring-2 ring-blue-500' : 'hover:shadow-lg'
              }`}
              onClick={() => isDir ? onNavigate(item.path) : onOpen(item.path, item.mime)}
            >
              {isDir ? (
                <div className="relative">
                  {folderThumbs[item.path] ? (
                    <>
                      <img src={folderThumbs[item.path]} alt="" className="w-full" loading="lazy" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <FileTypeIcon mime="folder" className="w-8 h-8" isDir={true} />
                      </div>
                    </>
                  ) : (
                    <div className="aspect-square flex items-center justify-center bg-yellow-50 dark:bg-yellow-900/20">
                      <FileTypeIcon mime="folder" className="w-8 h-8" isDir={true} />
                    </div>
                  )}
                </div>
              ) : isImage ? (
                <div className="w-full aspect-auto">
                  <SafeThumb path={item.path} />
                </div>
              ) : isVideo ? (
                <div className="aspect-video flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                  <svg className="w-10 h-10 text-white/60" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                </div>
              ) : (
                <FileTypeIcon mime="application/octet-stream" className="w-8 h-8" />
              )}
              <div className="p-2">
                <div className="text-sm font-medium truncate">{item.name.endsWith('.url') ? item.name.slice(0, -4) : item.name}</div>
                {!isDir && <div className="text-xs text-gray-400">{formatSize(item.size)}</div>}
              </div>
              <div
                className={`absolute top-2 left-2 transition-opacity ${isSelectionMode ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}
                onClick={(e) => { e.stopPropagation(); handleToggleSelect(item.path); }}
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                  isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white/80 dark:bg-gray-800/80 border-gray-300'
                }`}>
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
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
    </>
  );
}
