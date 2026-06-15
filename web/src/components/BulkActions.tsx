import { useState } from 'react';

interface Props {
  selectedCount: number;
  totalCount: number;
  onDelete: () => void;
  onDownload: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export default function BulkActions({
  selectedCount, totalCount, onDelete, onDownload, onSelectAll, onDeselectAll,
}: Props) {
  const [confirming, setConfirming] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slide-up">
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 dark:bg-gray-800 text-white rounded-2xl shadow-2xl border border-white/10">
        {/* Count */}
        <span className="text-sm font-medium">
          已选 {selectedCount} / {totalCount}
        </span>

        <div className="w-px h-5 bg-white/20" />

        {/* Select all / deselect */}
        {selectedCount < totalCount ? (
          <button
            onClick={onSelectAll}
            className="text-sm text-blue-300 hover:text-blue-200 transition-colors"
          >
            全选
          </button>
        ) : (
          <button
            onClick={onDeselectAll}
            className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
          >
            取消全选
          </button>
        )}

        <div className="w-px h-5 bg-white/20" />

        {/* Download selected */}
        <button
          onClick={onDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
          title="下载选中文件"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          下载
        </button>

        {/* Delete selected */}
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-300">确认删除?</span>
            <button
              onClick={() => { onDelete(); setConfirming(false); }}
              className="px-3 py-1.5 bg-red-500 hover:bg-red-600 rounded-lg text-sm transition-colors"
            >
              删除
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-2 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm transition-colors"
            title="删除选中文件"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            删除
          </button>
        )}

        {/* Close */}
        <button
          onClick={onDeselectAll}
          className="p-1 text-gray-400 hover:text-white transition-colors ml-1"
          title="取消选择"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
