/**
 * ActivityPage — view operation history and traffic stats.
 * Inspired by ZPan's activity logging.
 */

import { useState, useEffect, useCallback } from 'react';

interface ActivityItem {
  id: number;
  action: string;
  path: string;
  new_path: string | null;
  user: string | null;
  details: string | null;
  created_at: string;
}

interface TrafficStats {
  totalBytes: number;
  requestCount: number;
  byDay: { date: string; bytes: number; count: number }[];
  days: number;
}

interface Props {
  onClose: () => void;
}

const ACTION_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  upload: { label: '上传', icon: '📤', color: 'text-blue-500' },
  delete: { label: '删除', icon: '🗑️', color: 'text-red-500' },
  rename: { label: '重命名', icon: '✏️', color: 'text-yellow-500' },
  move: { label: '移动', icon: '📦', color: 'text-purple-500' },
  mkdir: { label: '创建文件夹', icon: '📁', color: 'text-green-500' },
  restore: { label: '恢复', icon: '♻️', color: 'text-emerald-500' },
  purge: { label: '永久删除', icon: '💥', color: 'text-red-700' },
};

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ActivityPage({ onClose }: Props) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [traffic, setTraffic] = useState<TrafficStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'activity' | 'traffic'>('activity');
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const loadActivity = useCallback(async (currentOffset: number = 0) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/activity?limit=50&offset=${currentOffset}`, { headers });
      const data = await res.json();
      if (currentOffset === 0) setActivities(data.items || []);
      else setActivities(prev => [...prev, ...(data.items || [])]);
      setHasMore(data.hasMore);
      setOffset(currentOffset + (data.items?.length || 0));
    } catch (err) {
      console.error('Failed to load activity:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTraffic = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/stats/traffic?days=30', { headers });
      const data = await res.json();
      setTraffic(data);
    } catch (err) {
      console.error('Failed to load traffic:', err);
    }
  }, []);

  useEffect(() => {
    loadActivity();
    loadTraffic();
  }, [loadActivity, loadTraffic]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="text-lg font-semibold">📊 活动日志</h1>
          <div className="flex gap-1 ml-auto">
            <button onClick={() => setTab('activity')} className={`px-3 py-1.5 text-sm rounded-lg ${tab === 'activity' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>操作记录</button>
            <button onClick={() => setTab('traffic')} className={`px-3 py-1.5 text-sm rounded-lg ${tab === 'traffic' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>流量统计</button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {tab === 'traffic' && traffic && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-400 mb-1">30天总流量</p>
              <p className="text-2xl font-bold">{formatSize(traffic.totalBytes)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-400 mb-1">30天请求数</p>
              <p className="text-2xl font-bold">{traffic.requestCount.toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-400 mb-1">日均流量</p>
              <p className="text-2xl font-bold">{formatSize(traffic.totalBytes / (traffic.days || 1))}</p>
            </div>
            {traffic.byDay.length > 0 && (
              <div className="col-span-full bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-400 mb-3">每日流量</p>
                <div className="space-y-1">
                  {traffic.byDay.map(day => {
                    const maxBytes = Math.max(...traffic.byDay.map(d => d.bytes), 1);
                    const pct = (day.bytes / maxBytes) * 100;
                    return (
                      <div key={day.date} className="flex items-center gap-2 text-xs">
                        <span className="w-16 text-gray-400">{day.date.slice(5)}</span>
                        <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                          <div className="h-full bg-blue-500 rounded" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-20 text-right">{formatSize(day.bytes)}</span>
                        <span className="w-12 text-right text-gray-400">{day.count}次</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'activity' && (
          <>
            {loading && activities.length === 0 && (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
              </div>
            )}

            {activities.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <p className="text-lg font-medium">暂无活动记录</p>
                <p className="text-sm">操作文件后会在这里显示</p>
              </div>
            )}

            <div className="space-y-1">
              {activities.map(item => {
                const action = ACTION_LABELS[item.action] || { label: item.action, icon: '❓', color: 'text-gray-500' };
                return (
                  <div key={item.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                    <span className="text-lg">{action.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${action.color}`}>{action.label}</span>
                        <span className="text-sm truncate">{item.path}</span>
                      </div>
                      {item.new_path && <p className="text-xs text-gray-400">→ {item.new_path}</p>}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{formatDate(item.created_at)}</span>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-4">
                <button onClick={() => loadActivity(offset)} className="px-4 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750">加载更多</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
