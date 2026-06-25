import { useState, useEffect, useRef, useMemo } from 'react';
import type { FileItem } from '../types';
import { useFolderThumbnails } from '../hooks/useFolderThumbnails';
import SafeThumb, { SafeThumbUrl } from './SafeThumb';
import FileTypeIcon from './FileTypeIcon';
import EmptyState from './EmptyState';
import { formatSize } from '../utils';
import { getThumbUrl, getFileUrl } from '../api';

/* Badge label for media types — matching FileGrid */
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

function getBadgeColor(mime: string): string {
  if (mime.startsWith('video/')) return 'bg-purple-500/90 text-white';
  if (mime.startsWith('audio/')) return 'bg-green-500/90 text-white';
  if (mime === 'application/pdf') return 'bg-red-500/90 text-white';
  if (mime.includes('word') || mime.includes('document')) return 'bg-blue-600/90 text-white';
  if (mime.includes('sheet') || mime.includes('excel')) return 'bg-green-600/90 text-white';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'bg-orange-500/90 text-white';
  return 'bg-gray-500/90 text-white';
}

function getExtBadge(name: string): string | null {
  const ext = name.split('.').pop()?.toUpperCase();
  if (!ext || ext.length > 5) return null;
  return ext;
}

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

function getKindOrder(mime: string): number {
  if (mime.startsWith('image/')) return 0;
  if (mime.startsWith('video/')) return 1;
  if (mime.startsWith('audio/')) return 2;
  if (mime === 'application/pdf' || mime.startsWith('text/') ||
      mime === 'application/json' || mime === 'application/xml' ||
      mime === 'application/javascript' || mime === 'application/x-yaml') return 3;
  return 4;
}

interface Props {
  files: Record<string, FileItem>;
  dirs: string[];
  dirMtimes?: Record<string, number>;
  currentDir: string;
  onNavigate: (path: string) => void;
  onOpen: (path: string, mime: string) => void;
  onDelete?: (paths: string[]) => void;
  selected?: Set<string>;
  onSelect?: (path: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  /** Parent sort from Header */
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  /** Current search term for filename highlighting */
  search?: string;
}


export default function FileColumns({ files, dirs, dirMtimes, currentDir, onNavigate, onOpen, onDelete, selected: externalSelected, onSelect, onLoadMore, hasMore, loadingMore, sortBy: sortByProp, sortOrder: sortOrderProp, search }: Props) {
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const folderThumbs = useFolderThumbnails(dirs, currentDir);

  const selected = externalSelected ?? internalSelected;
  const isSelectionMode = selected.size > 0;

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
        cmp = seededHash(a.name) - seededHash(b.name);
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [dirs, files, currentDir, sortKey, sortDir, dirMtimes]);

  const handleToggleSelect = (path: string) => {
    if (onSelect) { onSelect(path); return; }
    setInternalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

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

  return (
    <>
      <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-4 space-y-4">
        {sortedItems.map((item) => {
          const isDir = item.type === 'directory';
          const isImage = item.mime.startsWith('image/');
          const isVideo = item.mime.startsWith('video/');
          const isSelected = selected.has(item.path);
          const badge = getTypeBadge(item.mime);
          const extBadge = !isImage ? getExtBadge(item.name) : null;

          return (
            <div
              key={item.path}
              className={`break-inside-avoid render-optimized rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer transition-all relative ${
                isSelected ? 'ring-2 ring-blue-500' : 'hover:shadow-lg'
              }`}
              onClick={() => isDir ? onNavigate(item.path) : onOpen(item.path, item.mime)}
            >
              {isDir ? (
                <div className="relative">
                  {folderThumbs[item.path] ? (
                    <>
                      <img src={folderThumbs[item.path]} alt="" className="w-full" loading="lazy" decoding="async" fetchPriority="low" />
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
                  <SafeThumb path={item.path} mtime={item.mtime} />
                </div>
              ) : isVideo ? (
                <div className="w-full aspect-video relative bg-black">
                  <SafeThumbUrl
                    url={getThumbUrl(item.path)}
                    className="w-full h-full object-cover"
                    containerSize="md"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/10 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                      <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="aspect-square flex items-center justify-center bg-gray-50 dark:bg-gray-700">
                  <FileTypeIcon mime={item.mime} className="w-10 h-10" />
                </div>
              )}
              {/* Type badge */}
              {!isImage && !isVideo && !isDir && badge && (
                <span className={`absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-bold rounded ${getBadgeColor(item.mime)} z-10`}>
                  {badge}
                </span>
              )}
              {/* Ext badge fallback */}
              {!isImage && !isVideo && !isDir && !badge && extBadge && (
                <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-bold rounded bg-gray-600/80 text-white z-10">
                  {extBadge}
                </span>
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

      {sortedItems.length === 0 && (
        <EmptyState type="directory" />
      )}
    </>
  );
}
