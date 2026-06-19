import { useState } from 'react';

interface Props {
  selectedCount: number;
  totalCount: number;
  onDelete: () => void;
  onDownload: () => void;
  onDownloadZip?: () => void;
  onCopyLinks?: () => void;
  onCopyDirectLinks?: () => void;
  onBatchRename?: () => void;
  onCopy?: () => void;
  onDuplicate?: () => void;
  onCreateZip?: () => void;
  onMoveToFolder?: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export default function BulkActions({
  selectedCount, totalCount, onDelete, onDownload, onDownloadZip, onCopyLinks, onCopyDirectLinks, onBatchRename, onCopy, onDuplicate, onCreateZip, onMoveToFolder, onSelectAll, onDeselectAll,
}: Props) {
  const [confirming, setConfirming] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slide-up max-w-[calc(100vw-1rem)]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 dark:bg-gray-800 text-white rounded-2xl shadow-2xl border border-white/10 overflow-x-auto scrollbar-none flex-nowrap">
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

        {/* Batch rename */}
        {onBatchRename && (
          <button
            onClick={onBatchRename}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
            title="批量重命名"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            重命名
          </button>
        )}

        {/* ZIP download */}
        {onDownloadZip && (
          <button
            onClick={onDownloadZip}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
            title="打包下载为 ZIP"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            ZIP
          </button>
        )}

        {/* Copy links */}
        {onCopyLinks && (
          <button
            onClick={onCopyLinks}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
            title="复制选中文件的链接"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            复制链接
          </button>
        )}

        {/* Copy direct links */}
        {onCopyDirectLinks && (
          <button
            onClick={onCopyDirectLinks}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
            title="复制选中文件的直链"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            复制直链
          </button>
        )}

        {/* Copy */}
        {onCopy && (
          <button
            onClick={onCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
            title="复制选中文件"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            复制
          </button>
        )}

        {/* Duplicate */}
        {onDuplicate && (
          <button
            onClick={onDuplicate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
            title="创建副本"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            重复
          </button>
        )}

        {/* Create ZIP */}
        {onCreateZip && (
          <button
            onClick={onCreateZip}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
            title="压缩为 ZIP"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            压缩
          </button>
        )}

        {/* Move to folder */}
        {onMoveToFolder && (
          <button
            onClick={onMoveToFolder}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
            title="移动到文件夹"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 4h4a2 2 0 012 2v14a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h4m4-2v4m0 0l-4-4m4 4l4-4" />
            </svg>
            移动
          </button>
        )}

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
