/**
 * TrashPage — view, restore, and permanently delete trashed files.
 * Inspired by ZPan's trash system.
 *
 * v2 improvements:
 * - Sort by name, deletion date, or file size (asc/desc toggle)
 * - "Select All" / "Deselect All" checkbox in header
 * - Ctrl+A / Cmd+A keyboard shortcut to toggle select all
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import { listTrash, restoreTrash, purgeTrash, emptyTrash, type TrashItem as ApiTrashItem } from '../api';
import FileTypeIcon from './FileTypeIcon';
import { formatSize } from '../utils';


interface Props {
  onClose: () => void;
  onRestore: () => void;
}

type SortField = 'name' | 'deleted_at' | 'size';
type SortDir = 'asc' | 'desc';


function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}


/**
 * Sort comparator factory: returns (a, b) => -1 | 0 | 1 for a given field + direction.
 */
function sortItems(items: ApiTrashItem[], field: SortField, dir: SortDir): ApiTrashItem[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'name':
        cmp = (a.name || '').localeCompare(b.name || '');
        break;
      case 'deleted_at':
        cmp = (a.deleted_at || '').localeCompare(b.deleted_at || '');
        break;
      case 'size':
        cmp = (a.size ?? 0) - (b.size ?? 0);
        break;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}


const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: 'deleted_at', label: '删除时间' },
  { field: 'name', label: '名称' },
  { field: 'size', label: '大小' },
];


export default function TrashPage({ onClose, onRestore }: Props) {
  const [items, setItems] = useState<ApiTrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const confirm = useConfirm();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('deleted_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectAllMode, setSelectAllMode] = useState<'none' | 'some' | 'all'>('none');

  const sortedItems = useMemo(
    () => sortItems(items, sortField, sortDir),
    [items, sortField, sortDir],
  );

  const loadTrash = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTrash();
      setItems(data.items || []);
    } catch (err) {
      console.error('Failed to load trash:', err);
      toast('error', `加载回收站失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTrash(); }, [loadTrash]);

  // Keyboard: Escape to close; Ctrl+A / Cmd+A to toggle select all
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      // Ctrl+A or Cmd+A: toggle select all
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        // Only handle in trash page (don't interfere with other inputs)
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          if (items.length === 0) return;
          if (selected.size === items.length) {
            setSelected(new Set());
          } else {
            setSelected(new Set(items.map(i => i.original_path)));
          }
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, items, selected]);

  // Update selectAllMode whenever selected or items change
  useEffect(() => {
    if (items.length === 0 || selected.size === 0) {
      setSelectAllMode('none');
    } else if (selected.size === items.length) {
      setSelectAllMode('all');
    } else {
      setSelectAllMode('some');
    }
  }, [selected, items.length]);

  const handleSelectAll = () => {
    if (selectAllMode === 'all') {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map(i => i.original_path)));
    }
  };

  const handleRestore = async (paths: string[]) => {
    if (paths.length === 0) return;
    try {
      const data = await restoreTrash(paths);
      if (data.success) {
        toast('success', `已恢复 ${paths.length} 个项目`);
        setSelected(new Set());
        loadTrash();
        onRestore();
      }
    } catch (err) {
      toast('error', `恢复失败: ${(err as Error).message}`);
    }
  };

  const handlePurge = async (paths: string[]) => {
    if (paths.length === 0) return;
    const confirmed = await confirm({
      title: `永久删除 ${paths.length} 个项目`,
      message: '此操作不可撤销。',
      confirmLabel: '永久删除',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      const data = await purgeTrash(paths);
      if (data.success) {
        toast('success', `已永久删除 ${paths.length} 个项目`);
        setSelected(new Set());
        loadTrash();
      }
    } catch (err) {
      toast('error', `删除失败: ${(err as Error).message}`);
    }
  };

  const handleEmpty = async () => {
    const confirmed = await confirm({
      title: '清空回收站',
      message: '确认清空回收站？此操作不可撤销。',
      confirmLabel: '清空',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      const data = await emptyTrash();
      toast('success', `已清空回收站 (${data.purged} 个项目)`);
      setSelected(new Set());
      loadTrash();
    } catch (err) {
      toast('error', `清空失败: ${(err as Error).message}`);
    }
  };

  const toggleSelect = (path: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  /** Toggle sort field; flip direction if same field clicked again */
  const handleSortToggle = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  /** Arrow indicator for active sort column */
  const SortArrow = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return (
      <svg className={`w-3 h-3 inline-block ml-0.5 transition-transform ${sortDir === 'asc' ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    );
  };

  return (
    <div className="fixed inset-0 z-40 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold flex items-center gap-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>回收站</h1>
            <p className="text-xs text-gray-400">{items.length} 个项目{selected.size > 0 ? ` · 已选 ${selected.size}` : ''}</p>
          </div>
          {selected.size > 0 && (
            <div className="flex gap-2">
              <button onClick={() => handleRestore(Array.from(selected))} className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600">恢复选中 ({selected.size})</button>
              <button onClick={() => handlePurge(Array.from(selected))} className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">永久删除</button>
            </div>
          )}
          {items.length > 0 && selected.size === 0 && (
            <button onClick={handleEmpty} className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">清空回收站</button>
          )}
        </div>
        {/* Sort bar */}
        {items.length > 0 && (
          <div className="max-w-4xl mx-auto px-4 pb-2 flex items-center gap-2 text-xs text-gray-400">
            <span className="mr-1 shrink-0">排序:</span>
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.field}
                onClick={() => handleSortToggle(opt.field)}
                className={`px-2 py-1 rounded-md transition-colors ${
                  sortField === opt.field
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {opt.label}
                <SortArrow field={opt.field} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            <p className="text-lg font-medium">回收站为空</p>
            <p className="text-sm">删除的文件会出现在这里</p>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="space-y-2">
            {/* Select-all row */}
            {items.length > 0 && (
              <div className="flex items-center gap-3 px-3 py-2">
                <button
                  onClick={handleSelectAll}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                    selectAllMode === 'all'
                      ? 'bg-blue-500 border-blue-500'
                      : selectAllMode === 'some'
                        ? 'bg-blue-200 dark:bg-blue-900/40 border-blue-400'
                        : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {selectAllMode === 'all' && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    )}
                    {selectAllMode === 'some' && (
                      <svg className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" /></svg>
                    )}
                  </div>
                  {selectAllMode === 'all' ? '取消全选' : '全选'}
                </button>
                <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                <span className="text-xs text-gray-400">快捷键: <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-mono border border-gray-200 dark:border-gray-700">⌘A</kbd></span>
              </div>
            )}
            {/* Sorted items */}
            {sortedItems.map(item => {
              const isSelected = selected.has(item.original_path);
              return (
                <div
                  key={item.original_path}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                  onClick={() => toggleSelect(item.original_path)}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    )}
                  </div>
                  <span className="flex items-center justify-center w-9 h-9 shrink-0"><FileTypeIcon mime={item.mime} className="w-7 h-7" isDir={!!item.is_dir} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-gray-400">{item.original_path}</p>
                  </div>
                  <span className="text-xs text-gray-400">{formatSize(item.size)}</span>
                  <span className="text-xs text-gray-400">{formatDate(item.deleted_at)}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRestore([item.original_path]); }}
                      className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                      title="恢复"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePurge([item.original_path]); }}
                      className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                      title="永久删除"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
