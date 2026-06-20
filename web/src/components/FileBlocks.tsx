import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import type { FileItem } from '../types';
import { getFileUrl, duplicateFile, downloadZip, moveItem, copyFile } from '../api';
import { useFolderThumbnails } from '../hooks/useFolderThumbnails';
import { toast } from '../hooks/useToast';
import SafeThumb from './SafeThumb';
import FileTypeIcon from './FileTypeIcon';
import EmptyState from './EmptyState';
import { formatSize } from '../utils';

const FolderPicker = lazy(() => import('./FolderPicker'));
const ShareDialog = lazy(() => import('./ShareDialog'));

interface Props {
  files: Record<string, FileItem>;
  dirs: string[];
  currentDir: string;
  onNavigate: (path: string) => void;
  onOpen: (path: string, mime: string) => void;
  onDelete?: (paths: string[]) => void;
  onRename?: (path: string, name: string) => void;
  onMove?: () => void;
  selected?: Set<string>;
  onSelect?: (path: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}


export default function FileBlocks({ files, dirs, currentDir, onNavigate, onOpen, onDelete, onRename, onMove, selected: externalSelected, onSelect, onLoadMore, hasMore, loadingMore }: Props) {
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; name: string; isDir: boolean } | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);
  const [shareDialog, setShareDialog] = useState<{ path: string; name: string } | null>(null);
  const [folderPicker, setFolderPicker] = useState<{ mode: 'move' | 'copy'; path: string } | null>(null);
  const folderThumbs = useFolderThumbnails(dirs, currentDir);

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

  const handleTouchMove = () => { longPressCancelled.current = true; clearLongPress(); };
  const handleTouchEnd = () => { longPressCancelled.current = true; clearLongPress(); };

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

  const handleContextMenu = (e: React.MouseEvent, path: string, name: string, isDir: boolean) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, path, name, isDir });
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {allItems.map((item) => {
          const isDir = item.type === 'directory';
          const isImage = item.mime.startsWith('image/');
          const isVideo = item.mime.startsWith('video/');
          const isSelected = selected.has(item.path);

          return (
            <div
              key={item.path}
              className={`group relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer transition-all ${
                isSelected ? 'ring-2 ring-blue-500' : 'hover:shadow-lg'
              }`}
              onClick={() => isDir ? onNavigate(item.path) : onOpen(item.path, item.mime)}
              onContextMenu={(e) => handleContextMenu(e, item.path, item.name, isDir)}
              onTouchStart={(e) => handleTouchStart(e, item.path, item.name, isDir)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div className="aspect-square">
                {isDir ? (
                  <div className="w-full h-full flex items-center justify-center bg-yellow-50 dark:bg-yellow-900/20 relative">
                    {folderThumbs[item.path] ? (
                      <>
                        <img src={folderThumbs[item.path]} alt="" className="w-full h-full object-cover opacity-60" loading="lazy" decoding="async" fetchPriority="low" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <FileTypeIcon mime="folder" className="w-8 h-8" isDir={true} />
                        </div>
                      </>
                    ) : (
                      <FileTypeIcon mime="folder" className="w-8 h-8" isDir={true} />
                    )}
                  </div>
                ) : isImage ? (
                  <SafeThumb path={item.path} />
                ) : isVideo ? (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                    <svg className="w-12 h-12 text-white/60" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  </div>
                ) : (
                  <FileTypeIcon mime="application/octet-stream" className="w-8 h-8" />
                )}
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
                {renaming?.path === item.path ? (
                  <input
                    autoFocus
                    defaultValue={renaming.name}
                    className="w-full text-sm px-1.5 py-0.5 rounded border border-blue-500 outline-none text-white bg-black/50"
                    onBlur={(e) => {
                      if (e.target.value && e.target.value !== renaming.name) onRename?.(item.path, e.target.value);
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null); }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="text-white text-sm font-medium truncate">{item.name.endsWith('.url') ? item.name.slice(0, -4) : item.name}</div>
                )}
                {!isDir && <div className="text-white/70 text-xs">{formatSize(item.size)}</div>}
              </div>
              <div
                className={`absolute top-2 left-2 transition-opacity ${isSelectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
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
        <EmptyState type="directory" />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[180px]"
            style={{ left: Math.min(contextMenu.x, window.innerWidth - 200), top: Math.min(contextMenu.y, window.innerHeight - 300) }}
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
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              onClick={() => { setFolderPicker({ mode: 'move', path: contextMenu.path }); setContextMenu(null); }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
              移动到...
            </button>
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              onClick={() => { setFolderPicker({ mode: 'copy', path: contextMenu.path }); setContextMenu(null); }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              复制到...
            </button>
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
        <Suspense fallback={null}>
          <ShareDialog filePath={shareDialog.path} fileName={shareDialog.name} onClose={() => setShareDialog(null)} />
        </Suspense>
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