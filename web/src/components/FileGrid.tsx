import { useState } from 'react';
import type { FileItem } from '../types';
import { getFileUrl } from '../api';

interface Props {
  files: Record<string, FileItem>;
  dirs: string[];
  currentDir: string;
  onNavigate: (path: string) => void;
  onOpen: (path: string, mime: string) => void;
  onDelete?: (paths: string[]) => void;
  onRename?: (path: string, name: string) => void;
}

function getIcon(mime: string) {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime === 'application/pdf') return '📄';
  if (mime.startsWith('text/')) return '📝';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) return '📦';
  return '📎';
}

function formatSize(bytes: number) {
  if (bytes === 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function FileGrid({ files, dirs, currentDir, onNavigate, onOpen, onDelete, onRename }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; name: string; isDir: boolean } | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, path: string, name: string, isDir: boolean) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, path, name, isDir });
  };

  const handleClick = (e: React.MouseEvent, path: string) => {
    if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    } else {
      setSelected(new Set());
    }
  };

  return (
    <>
      {/* Directories */}
      {dirs.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Folders</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {dirs.map((name) => {
              const path = currentDir ? `${currentDir}/${name}` : name;
              return (
                <button
                  key={path}
                  onClick={() => onNavigate(path)}
                  onContextMenu={(e) => handleContextMenu(e, path, name, true)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
                >
                  <div className="w-16 h-16 flex items-center justify-center text-3xl bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
                    📁
                  </div>
                  <span className="text-sm text-center truncate w-full group-hover:text-blue-500">{name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Files */}
      {Object.keys(files).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Files</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {Object.entries(files).map(([name, file]) => {
              const isImage = file.mime.startsWith('image/');
              const isVideo = file.mime.startsWith('video/');
              const isSelected = selected.has(file.path);
              const thumbUrl = isImage ? getFileUrl(file.path) + '&resize=320' : null;

              return (
                <button
                  key={file.path}
                  onClick={(e) => {
                    handleClick(e, file.path);
                    if (isImage || isVideo) onOpen(file.path, file.mime);
                  }}
                  onDoubleClick={() => onOpen(file.path, file.mime)}
                  onContextMenu={(e) => handleContextMenu(e, file.path, name, false)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-colors group ${
                    isSelected
                      ? 'bg-blue-100 dark:bg-blue-900/30 ring-2 ring-blue-500'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="w-full aspect-square flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden relative">
                    {isImage ? (
                      <img
                        src={thumbUrl!}
                        alt={name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : isVideo ? (
                      <div className="w-full h-full flex items-center justify-center bg-gray-800 text-white text-4xl">
                        ▶
                      </div>
                    ) : (
                      <span className="text-4xl">{getIcon(file.mime)}</span>
                    )}
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
                    <span className="text-xs text-center truncate w-full group-hover:text-blue-500" title={name}>
                      {name}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400">{formatSize(file.size)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {dirs.length === 0 && Object.keys(files).length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
          <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <p className="text-lg font-medium">No files</p>
          <p className="text-sm">Drop files here to upload</p>
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
              Rename
            </button>
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500"
              onClick={() => { onDelete?.([contextMenu.path]); setContextMenu(null); }}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </>
  );
}
