/**
 * TrashPage — view, restore, and permanently delete trashed files.
 * Inspired by ZPan's trash system.
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from '../hooks/useToast';

interface TrashItem {
  id: number;
  original_path: string;
  name: string;
  mime: string;
  size: number;
  is_dir: number;
  deleted_at: string;
  deleted_by: string | null;
}

interface Props {
  onClose: () => void;
  onRestore: () => void;
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getIcon(mime: string, isDir: boolean): string {
  if (isDir) return '📁';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime === 'application/pdf') return '📄';
  return '📎';
}

export default function TrashPage({ onClose, onRestore }: Props) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadTrash = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/trash', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      console.error('Failed to load trash:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTrash(); }, [loadTrash]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleRestore = async (paths: string[]) => {
    if (paths.length === 0) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/trash/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ paths }),
      });
      const data = await res.json();
      if (data.success) {
        toast('success', `已恢复 ${paths.length} 个项目`);
        setSelected(new Set());
        loadTrash();
        onRestore();
      }
    } catch (err) {
      toast('error', '恢复失败');
    }
  };

  const handlePurge = async (paths: string[]) => {
    if (paths.length === 0) return;
    if (!confirm(`确认永久删除 ${paths.length} 个项目？此操作不可撤销。`)) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/trash/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ paths }),
      });
      const data = await res.json();
      if (data.success) {
        toast('success', `已永久删除 ${paths.length} 个项目`);
        setSelected(new Set());
        loadTrash();
      }
    } catch (err) {
      toast('error', '删除失败');
    }
  };

  const handleEmpty = async () => {
    if (!confirm('确认清空回收站？此操作不可撤销。')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/trash/empty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await res.json();
      if (data.success) {
        toast('success', `已清空回收站 (${data.purged} 个项目)`);
        setSelected(new Set());
        loadTrash();
      }
    } catch (err) {
      toast('error', '清空失败');
    }
  };

  const toggleSelect = (path: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-40 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">🗑️ 回收站</h1>
            <p className="text-xs text-gray-400">{items.length} 个项目</p>
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
            {items.map(item => (
              <div
                key={item.original_path}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                  selected.has(item.original_path)
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'
                }`}
                onClick={() => toggleSelect(item.original_path)}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  selected.has(item.original_path) ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600'
                }`}>
                  {selected.has(item.original_path) && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  )}
                </div>
                <span className="text-xl">{getIcon(item.mime, !!item.is_dir)}</span>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
