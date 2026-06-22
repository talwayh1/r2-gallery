import { useState, useEffect } from 'react';
import { getStats, type Stats } from '../api';

interface Props {
  onClose: () => void;
}

import { formatSize } from '../utils';

const TYPE_COLORS: Record<string, string> = {
  image: '#3b82f6',
  video: '#ef4444',
  audio: '#8b5cf6',
  document: '#f59e0b',
  other: '#6b7280',
};

const TYPE_LABELS: Record<string, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  document: '文档',
  other: '其他',
};

export default function StatsPanel({ onClose }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStats().then(setStats).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Compute conic-gradient for pie chart
  const pieGradient = stats ? (() => {
    const total = stats.totalSize || 1;
    const entries = Object.entries(stats.fileTypes).filter(([, v]) => v.size > 0);
    let angle = 0;
    const stops: string[] = [];
    entries.forEach(([key, val]) => {
      const slice = (val.size / total) * 360;
      stops.push(`${TYPE_COLORS[key]} ${angle}deg ${angle + slice}deg`);
      angle += slice;
    });
    return `conic-gradient(${stops.join(', ')})`;
  })() : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">📊 存储统计</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">✕</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        ) : stats ? (
          <div className="flex-1 overflow-auto p-6 space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.totalFiles.toLocaleString()}</div>
                <div className="text-sm text-gray-500 mt-1">总文件数</div>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{formatSize(stats.totalSize)}</div>
                <div className="text-sm text-gray-500 mt-1">总容量</div>
              </div>
            </div>

            {/* Pie chart + Type breakdown */}
            <div className="flex items-start gap-6">
              <div className="w-40 h-40 rounded-full shrink-0" style={{ background: pieGradient }} />
              <div className="flex-1">
                <h3 className="font-medium mb-3">文件类型分布</h3>
                <div className="space-y-2">
                  {Object.entries(stats.fileTypes)
                    .filter(([, v]) => v.count > 0)
                    .sort((a, b) => b[1].size - a[1].size)
                    .map(([key, val]) => (
                      <div key={key} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[key] }} />
                        <span className="text-sm w-12">{TYPE_LABELS[key]}</span>
                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{
                              width: `${Math.max(2, (val.size / stats.totalSize) * 100)}%`,
                              backgroundColor: TYPE_COLORS[key],
                            }}
                          />
                        </div>
                        <span className="text-sm text-gray-500 w-20 text-right">{val.count} 个</span>
                        <span className="text-sm text-gray-400 w-20 text-right">{formatSize(val.size)}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Top directories */}
            {stats.topDirs.length > 0 && (
              <div>
                <h3 className="font-medium mb-3"><svg className="w-4 h-4 inline-block mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>热门目录</h3>
                <div className="bg-gray-50 dark:bg-gray-850 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left p-3">目录</th>
                        <th className="text-right p-3">文件数</th>
                        <th className="text-right p-3">容量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.topDirs.map(d => (
                        <tr key={d.dir} className="border-b border-gray-100 dark:border-gray-700/50">
                          <td className="p-3 font-mono text-xs truncate max-w-[200px]" title={d.dir}>{d.dir}</td>
                          <td className="p-3 text-right text-gray-500">{d.count}</td>
                          <td className="p-3 text-right text-gray-500">{formatSize(d.size)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recent uploads */}
            {stats.recentUploads.length > 0 && (
              <div>
                <h3 className="font-medium mb-3">🕐 最近上传</h3>
                <div className="space-y-1">
                  {stats.recentUploads.map(f => (
                    <div key={f.path} className="flex items-center gap-3 text-sm py-1.5 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                      <span className="flex-1 truncate font-mono text-xs">{f.path}</span>
                      <span className="text-gray-400">{formatSize(f.size)}</span>
                      <span className="text-gray-400 text-xs">{f.mtime ? new Date(f.mtime * 1000).toLocaleDateString() : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-500">加载失败</div>
        )}
      </div>
    </div>
  );
}
