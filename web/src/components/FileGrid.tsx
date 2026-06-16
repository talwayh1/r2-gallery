import { useState, useEffect, useRef } from 'react';
import type { FileItem } from '../types';
import { getFileUrl, getThumbUrl } from '../api';
import { useFolderThumbnails } from '../hooks/useFolderThumbnails';

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
}

type SortKey = 'name' | 'size' | 'date';
type SortDir = 'asc' | 'desc';

function getIcon(mime: string) {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime === 'application/pdf') return '📄';
  if (mime.startsWith('text/')) return '📝';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) return '📦';
  return '📎';
}

/** Badge label for media types */
function getTypeBadge(mime: string): string | null {
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.startsWith('audio/')) return 'AUDIO';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) return 'ZIP';
  return null;
}

/** Badge color classes */
function getBadgeColor(mime: string): string {
  if (mime.startsWith('video/')) return 'bg-purple-500/90 text-white';
  if (mime.startsWith('audio/')) return 'bg-green-500/90 text-white';
  if (mime === 'application/pdf') return 'bg-red-500/90 text-white';
  return 'bg-gray-500/90 text-white';
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

/** Get file extension for badge display */
function getExtBadge(name: string): string | null {
  const ext = name.split('.').pop()?.toUpperCase();
  if (!ext || ext.length > 5) return null;
  return ext;
}

/**
 * Image thumbnail with loading skeleton, fade-in, and error fallback.
 * Uses native <img> with loading="lazy" for efficient loading.
 */
function ImageThumbnail({ src, alt, onClick }: { src: string; alt: string; onClick: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

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

  return (
    <>
      {/* Shimmer placeholder — visible until image loads */}
      {!loaded && <div className="shimmer absolute inset-0 rounded-xl" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onClick={onClick}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </>
  );
}

/**
 * Video thumbnail with hover-to-preview.
 * Shows a play icon by default; on hover, loads and plays the video muted.
 */
function VideoThumbnail({ src, onClick }: { src: string; onClick: () => void }) {
  const [hovering, setHovering] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (hovering && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => { /* ignore autoplay block */ });
    } else if (!hovering && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [hovering]);

  return (
    <div
      className="w-full h-full relative"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Default play icon background */}
      <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 text-white transition-opacity duration-300 ${hovering && videoLoaded ? 'opacity-0' : 'opacity-100'}`}>
        <svg className="w-12 h-12 text-white/60" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>

      {/* Video preview (loaded on hover) */}
      {hovering && (
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

      {/* VIDEO badge */}
      <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 text-[9px] font-medium bg-black/70 text-white rounded z-10">
        VIDEO
      </span>
    </div>
  );
}

export default function FileGrid({ files, dirs, currentDir, onNavigate, onOpen, onDelete, onRename, selected: externalSelected, onSelect }: Props) {
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; name: string; isDir: boolean } | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Folder thumbnail images
  const folderThumbs = useFolderThumbnails(dirs, currentDir);

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

  // Build and sort items
  const dirItems = dirs.map((name) => ({
    name,
    type: 'directory' as const,
    size: 0,
    mime: 'directory',
    mtime: 0,
    path: currentDir ? `${currentDir}/${name}` : name,
  }));

  const fileItems = Object.values(files);

  const sortedDirs = [...dirItems].sort((a, b) => {
    const cmp = a.name.localeCompare(b.name);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const sortedFiles = [...fileItems].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortKey === 'size') cmp = a.size - b.size;
    else cmp = a.mtime - b.mtime;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const handleContextMenu = (e: React.MouseEvent, path: string, name: string, isDir: boolean) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, path, name, isDir });
  };

  const handleCardClick = (e: React.MouseEvent, path: string, mime: string) => {
    // If selection mode is active or Shift key, toggle selection
    if (isSelectionMode || e.shiftKey) {
      e.preventDefault();
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
    // Ctrl/Meta + click to enter selection mode
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
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
    // Normal click — open media
    const isImage = mime.startsWith('image/');
    const isVideo = mime.startsWith('video/');
    if (isImage || isVideo) {
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
          {(['name', 'size', 'date'] as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => toggleSort(key)}
              className={`px-2 py-1 rounded-md transition-colors ${
                sortKey === key
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {key === 'name' ? '名称' : key === 'size' ? '大小' : '日期'}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {sortedDirs.map((item) => (
              <button
                key={item.path}
                onClick={() => onNavigate(item.path)}
                onContextMenu={(e) => handleContextMenu(e, item.path, item.name, true)}
                className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
              >
                <div className="w-full aspect-square flex items-center justify-center bg-yellow-50 dark:bg-yellow-900/20 rounded-xl overflow-hidden relative">
                  {folderThumbs[item.path] ? (
                    <>
                      <img
                        src={folderThumbs[item.path]}
                        alt=""
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <span className="text-2xl drop-shadow-lg">📁</span>
                      </div>
                    </>
                  ) : (
                    <span className="text-3xl">📁</span>
                  )}
                </div>
                <span className="text-sm text-center truncate w-full group-hover:text-blue-500">{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Files */}
      {sortedFiles.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">文件</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {sortedFiles.map((file) => {
              const isImage = file.mime.startsWith('image/');
              const isVideo = file.mime.startsWith('video/');
              const isSelected = selected.has(file.path);
              const badge = getTypeBadge(file.mime);
              const extBadge = !isImage ? getExtBadge(file.name) : null;

              return (
                <button
                  key={file.path}
                  onClick={(e) => handleCardClick(e, file.path, file.mime)}
                  onDoubleClick={() => onOpen(file.path, file.mime)}
                  onContextMenu={(e) => handleContextMenu(e, file.path, file.name, false)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-colors group relative ${
                    isSelected
                      ? 'bg-blue-100 dark:bg-blue-900/30 ring-2 ring-blue-500'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="w-full aspect-square flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden relative">
                    {isImage ? (
                      <ImageThumbnail
                        src={getThumbUrl(file.path)}
                        alt={file.name}
                        onClick={() => handleCardClick(new MouseEvent('click') as any, file.path, file.mime)}
                      />
                    ) : isVideo ? (
                      <VideoThumbnail
                        src={getFileUrl(file.path)}
                        onClick={() => handleCardClick(new MouseEvent('click') as any, file.path, file.mime)}
                      />
                    ) : (
                      <span className="text-4xl">{getIcon(file.mime)}</span>
                    )}

                    {/* Type badge for non-image, non-video files (video has its own badge) */}
                    {!isImage && !isVideo && badge && (
                      <span className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded ${getBadgeColor(file.mime)}`}>
                        {badge}
                      </span>
                    )}

                    {/* Ext badge for generic files */}
                    {!isImage && !isVideo && !badge && extBadge && (
                      <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded bg-gray-600/80 text-white">
                        {extBadge}
                      </span>
                    )}

                    {/* Selection checkbox overlay */}
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
                      {file.name}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400">
                    {formatSize(file.size)}
                    {file.mtime > 0 && sortKey === 'date' && (
                      <span className="ml-1">{formatDate(file.mtime)}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {sortedDirs.length === 0 && sortedFiles.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
          <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <p className="text-lg font-medium">暂无文件</p>
          <p className="text-sm">拖拽文件到此处上传</p>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => { setRenaming({ path: contextMenu.path, name: contextMenu.name }); setContextMenu(null); }}
            >
              重命名
            </button>
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500"
              onClick={() => { onDelete?.([contextMenu.path]); setContextMenu(null); }}
            >
              删除
            </button>
          </div>
        </>
      )}
    </>
  );
}
