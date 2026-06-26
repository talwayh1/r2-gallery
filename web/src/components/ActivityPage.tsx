/**
 * ActivityPage — view operation history and traffic stats.
 * Inspired by ZPan's activity logging.
 *
 * Uses centralized API helpers (request from api.ts) for consistent
 * retry logic, auth headers, and error handling.
 */

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getActivity, getTrafficStats, type ActivityItem } from '../api';
import type { TrafficDay } from '../api';
import { formatSize } from '../utils';

interface TrafficStats {
  totalBytes: number;
  requestCount: number;
  byDay: TrafficDay[];
  days: number;
}

interface Props {
  onClose: () => void;
}

const ACTION_LABELS: Record<string, { labelKey: string; icon: ReactNode; color: string }> = {
  upload: { labelKey: 'activity.action.upload', icon: '📤', color: 'text-blue-500' },
  delete: { labelKey: 'activity.action.delete', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>, color: 'text-red-500' },
  rename: { labelKey: 'activity.action.rename', icon: '✏️', color: 'text-yellow-500' },
  move: { labelKey: 'activity.action.move', icon: '📦', color: 'text-purple-500' },
  mkdir: { labelKey: 'activity.action.mkdir', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>, color: 'text-green-500' },
  restore: { labelKey: 'activity.action.restore', icon: '♻️', color: 'text-emerald-500' },
  purge: { labelKey: 'activity.action.purge', icon: '💥', color: 'text-red-700' },
};

/** Format an ISO timestamp for display */
function formatDate(isoStr: string): string {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const PAGE_SIZE = 50;

export default function ActivityPage({ onClose }: Props) {
  const { t } = useTranslation();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [traffic, setTraffic] = useState<TrafficStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tab, setTab] = useState<'activity' | 'traffic'>('activity');
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const loadingRef = useRef(false); // prevent concurrent loads
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadActivity = useCallback(async (currentOffset: number = 0) => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    const isInitial = currentOffset === 0;
    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      const data = await getActivity(PAGE_SIZE, currentOffset);
      if (isInitial) setActivities(data.items || []);
      else setActivities(prev => [...prev, ...(data.items || [])]);
      setHasMore(data.hasMore);
      setOffset(currentOffset + (data.items?.length || 0));
      setLoadError(null);
    } catch (err) {
      console.error('Failed to load activity:', err);
      setLoadError(t('activity.loadError'));
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const loadTraffic = useCallback(async () => {
    try {
      const data = await getTrafficStats(30);
      setTraffic({ ...data, byDay: data.byDay || [] });
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

  // Infinite scroll sentinel for activity tab
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || tab !== 'activity') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingRef.current && hasMore) {
          loadActivity(offset);
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, offset, loadActivity, tab]);

  const maxTrafficBytes = traffic && traffic.byDay.length > 0
    ? Math.max(...traffic.byDay.map(d => d.bytes), 1)
    : 1;

  return (
    <div className="fixed inset-0 z-40 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="text-lg font-semibold">{t('activity.title')}</h1>
          <div className="flex gap-1 ml-auto">
            <button onClick={() => setTab('activity')} className={`px-3 py-1.5 text-sm rounded-lg ${tab === 'activity' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>{t('activity.tab.activity')}</button>
            <button onClick={() => setTab('traffic')} className={`px-3 py-1.5 text-sm rounded-lg ${tab === 'traffic' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>{t('activity.tab.traffic')}</button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {tab === 'traffic' && traffic && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-400 mb-1">{t('activity.traffic.total')}</p>
              <p className="text-2xl font-bold">{formatSize(traffic.totalBytes)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-400 mb-1">{t('activity.traffic.requests')}</p>
              <p className="text-2xl font-bold">{traffic.requestCount.toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-400 mb-1">{t('activity.traffic.avg')}</p>
              <p className="text-2xl font-bold">{formatSize(traffic.totalBytes / (traffic.days || 1))}</p>
            </div>
            {traffic.byDay.length > 0 && (
              <div className="col-span-full bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-400 mb-3">{t('activity.traffic.daily')}</p>
                <div className="space-y-1">
                  {traffic.byDay.map(day => {
                    const pct = (day.bytes / maxTrafficBytes) * 100;
                    return (
                      <div key={day.date} className="flex items-center gap-2 text-xs">
                        <span className="w-16 text-gray-400">{day.date.slice(5)}</span>
                        <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                          <div className="h-full bg-blue-500 rounded transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-20 text-right">{formatSize(day.bytes)}</span>
                        <span className="w-12 text-right text-gray-400">{t('activity.traffic.count', { count: day.count })}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Traffic loading state */}
        {tab === 'traffic' && !traffic && !loadError && (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        )}

        {tab === 'activity' && (
          <>
            {loadError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between">
                <span className="text-sm text-red-600 dark:text-red-400">{loadError}</span>
                <button
                  onClick={() => loadActivity(0)}
                  className="text-sm text-red-600 dark:text-red-400 underline hover:no-underline"
                >
                  {t('activity.retry')}
                </button>
              </div>
            )}

            {loading && activities.length === 0 && (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
              </div>
            )}

            {activities.length === 0 && !loading && !loadError && (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <p className="text-lg font-medium">{t('activity.empty')}</p>
                <p className="text-sm">{t('activity.empty.hint')}</p>
              </div>
            )}

            <div className="space-y-1">
              {activities.map(item => {
                const action = ACTION_LABELS[item.action] || { labelKey: 'activity.action.unknown', icon: '❓', color: 'text-gray-500' };
                return (
                  <div key={item.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                    <span className="text-lg">{action.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${action.color}`}>{t(action.labelKey)}</span>
                        <span className="text-sm truncate">{item.path}</span>
                      </div>
                      {item.new_path && <p className="text-xs text-gray-400">→ {item.new_path}</p>}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{formatDate(item.created_at)}</span>
                  </div>
                );
              })}
            </div>

            {/* Infinite scroll sentinel — replaces old "加载更多" button */}
            {hasMore && (
              <div ref={sentinelRef} className="flex items-center justify-center py-6">
                {loadingMore ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
                ) : (
                  <span className="text-xs text-gray-400">{t('activity.loadMore')}</span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
