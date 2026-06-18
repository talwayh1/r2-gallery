import { useState, useCallback } from 'react';
import type { FileItem } from '../types';
import { getFileUrl, duplicateFile } from '../api';
import { toast } from '../hooks/useToast';
import ShareDialog from './ShareDialog';

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

function formatSize(bytes: number) {
  if (bytes === 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(ts: number) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getIcon(mime: string) {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime === 'application/pdf') return '📄';
  if (mime.startsWith('text/')) return '📝';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) return '📦';
  if (mime.includes('word') || mime.includes('document')) return '📄';
  if (mime.includes('sheet') || mime.includes('excel')) return '📊';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📽️';
  return '📎';
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

function getTypeBadge(mime: string): string | null {
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.startsWith('audio/')) return 'AUDIO';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) return 'ZIP';
  if (mime.includes('word') || mime.includes('document')) return 'DOC';
  if (mime.includes('sheet') || mime.includes('excel')) return 'XLS';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'PPT';
  return null;
}

export default function FileList({ files, dirs, currentDir, onNavigate, onOpen, onDelete, onRename, selected: externalSelected, onSelect }: Props) {
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; name: string; isDir: boolean } | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);
  const [shareDialog, setShareDialog] = useState<{ path: string; name: string } | null>(null);

  // Use external selection state when provided
  const selected = externalSelected ?? internalSelected;
  const isSelectionMode = selected.size > 0;

  const allItems = [
    ...dirs.map((name) => ({
      name,
      type: 'directory' as const,
      size: 0,
      mime: 'directory',
      mtime: 0,
      path: currentDir ? `${currentDir}/${name}` : name,
    })),
    ...Object.values(files),
  ];

  const sorted = [...allItems].sort((a, b) => {
    // Directories first
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
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

  const handleRowClick = (e: React.MouseEvent, item: { path: string; mime: string; type: string }) => {
    // Selection mode
    if (isSelectionMode || e.shiftKey) {
      e.preventDefault();
      if (onSelect) onSelect(item.path);
      else {
        setInternalSelected((prev) => {
          const next = new Set(prev);
          if (next.has(item.path)) next.delete(item.path);
          else next.add(item.path);
          return next;
        });
      }
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (onSelect) onSelect(item.path);
      else {
        setInternalSelected((prev) => {
          const next = new Set(prev);
          next.add(item.path);
          return next;
        });
      }
      return;
    }
    // Normal click
    if (item.type === 'directory') onNavigate(item.path);
    else {
      const m = item.mime;
      const canOpen = m.startsWith('image/') || m.startsWith('video/') || m.startsWith('audio/') ||
        m === 'application/pdf' || m.startsWith('text/') || m === 'application/json' || m === 'application/xml' || m === 'application/javascript' ||
        m.includes('word') || m.includes('document') || m.includes('sheet') || m.includes('excel') || m.includes('presentation') || m.includes('powerpoint');
      if (canOpen) onOpen(item.path, item.mime);
    }
  };

  const SortIcon = ({ active, dir }: { active: boolean; dir: string }) => (
    <svg className={`w-3 h-3 ml-1 inline transition-colors ${active ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`} fill="currentColor" viewBox="0 0 20 20">
      <path d={dir === 'asc' ? 'M5 10l5-5 5 5' : 'M5 10l5 5 5-5'} />
    </svg>
  );

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700">
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 cursor-pointer select-none w-10" />
              <th className="text-left px-2 py-3 font-medium text-gray-500 dark:text-gray-400 cursor-pointer select-none" onClick={() => toggleSort('name')}>
                名称 <SortIcon active={sortKey === 'name'} dir={sortDir} />
              </th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400 w-24 cursor-pointer select-none" onClick={() => toggleSort('size')}>
                大小 <SortIcon active={sortKey === 'size'} dir={sortDir} />
              </th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400 w-32 cursor-pointer select-none" onClick={() => toggleSort('date')}>
                修改时间 <SortIcon active={sortKey === 'date'} dir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => {
              const isDir = item.type === 'directory';
              const isImage = item.mime.startsWith('image/');
              const isVideo = item.mime.startsWith('video/');
              const isSelected = selected.has(item.path);
              const badge = getTypeBadge(item.mime);

              return (
                <tr
                  key={item.path}
                  onClick={(e) => handleRowClick(e, item)}
                  onContextMenu={(e) => handleContextMenu(e, item.path, item.name, isDir)}
                  className={`border-b border-gray-100 dark:border-gray-700 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-750'
                  }`}
                >
                  {/* Checkbox / icon */}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-center">
                      {isSelectionMode ? (
                        <div
                          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-blue-500 border-blue-500'
                              : 'border-gray-300 dark:border-gray-500 hover:border-blue-400'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelect) onSelect(item.path);
                            else {
                              setInternalSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(item.path)) next.delete(item.path);
                                else next.add(item.path);
                                return next;
                              });
                            }
                          }}
                        >
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      ) : (
                        <span className="text-lg">{isDir ? '📁' : getIcon(item.mime)}</span>
                      )}
                    </div>
                  </td>

                  {/* Name */}
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      {renaming?.path === item.path ? (
                        <input
                          autoFocus
                          defaultValue={renaming.name}
                          className="flex-1 text-sm px-2 py-0.5 rounded border border-blue-500 outline-none bg-white dark:bg-gray-700"
                          onBlur={(e) => {
                            if (e.target.value && e.target.value !== renaming.name) {
                              onRename?.(item.path, e.target.value);
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
                        <span className="truncate group-hover:text-blue-500">{item.name.endsWith('.url') ? item.name.slice(0, -4) : item.name}</span>
                      )}
                      {badge && (
                        <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded shrink-0 ${getBadgeColor(item.mime)}`}>
                          {badge}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Size */}
                  <td className="text-right px-4 py-2.5 text-gray-500 dark:text-gray-400 tabular-nums">
                    {formatSize(item.size)}
                  </td>

                  {/* Date */}
                  <td className="text-right px-4 py-2.5 text-gray-500 dark:text-gray-400 tabular-nums">
                    {formatDate(item.mtime)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <p className="text-lg font-medium">暂无文件</p>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {!contextMenu.isDir && (
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = getFileUrl(contextMenu.path);
                  a.download = contextMenu.name;
                  a.click();
                  setContextMenu(null);
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                下载
              </button>
            )}
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              onClick={() => {
                setRenaming({ path: contextMenu.path, name: contextMenu.name });
                setContextMenu(null);
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              重命名
            </button>
            {!contextMenu.isDir && (
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              onClick={async () => {
                const viewUrl = `${window.location.origin}/view/${encodeURIComponent(contextMenu.path)}`;
                try {
                  await navigator.clipboard.writeText(viewUrl);
                  toast('success', '链接已复制');
                } catch (_e) { toast('error', '复制失败'); }
                setContextMenu(null);
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              复制链接
            </button>
            )}
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
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                复制直链
              </button>
            )}
            {!contextMenu.isDir && (
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                onClick={async () => {
                  try {
                    const result = await duplicateFile(contextMenu.path);
                    if (result.success) { toast('success', `已复制到 ${result.newPath}`); }
                  } catch (e) { toast('error', `复制失败: ${(e as Error).message}`); }
                  setContextMenu(null);
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                复制文件
              </button>
            )}
            {!contextMenu.isDir && (
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                onClick={() => { setShareDialog({ path: contextMenu.path, name: contextMenu.name }); setContextMenu(null); }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                分享
              </button>
            )}
            <hr className="border-gray-200 dark:border-gray-700 my-1" />
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500 flex items-center gap-2"
              onClick={() => { onDelete?.([contextMenu.path]); setContextMenu(null); }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              删除
            </button>
          </div>
        </>
      )}
      {shareDialog && (
        <ShareDialog filePath={shareDialog.path} fileName={shareDialog.name} onClose={() => setShareDialog(null)} />
      )}
    </>
  );
}
