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

export default function FileGrid({ files, dirs, currentDir, onNavigate, onOpen, onDelete, onRename }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; name: string; isDir: boolean } | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

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
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Folders</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {sortedDirs.map((item) => (
              <button
                key={item.path}
                onClick={() => onNavigate(item.path)}
                onContextMenu={(e) => handleContextMenu(e, item.path, item.name, true)}
                className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
              >
                <div className="w-16 h-16 flex items-center justify-center text-3xl bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
                  📁
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
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Files</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {sortedFiles.map((file) => {
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
                  onContextMenu={(e) => handleContextMenu(e, file.path, file.name, false)}
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
                        alt={file.name}
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
