import { useState, useEffect, useRef } from 'react';

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

/**
 * Detect narrow viewport via matchMedia ('(max-width: 639px)').
 * Returns true on mobile where BulkActions bar is width-constrained.
 */
function useIsNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    setNarrow(mq.matches);
    const handler = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return narrow;
}

export default function BulkActions({
  selectedCount, totalCount, onDelete, onDownload, onDownloadZip, onCopyLinks, onCopyDirectLinks, onBatchRename, onCopy, onDuplicate, onCreateZip, onMoveToFolder, onSelectAll, onDeselectAll,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const narrow = useIsNarrow();

  // Close "More" dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!showMore) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMore(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [showMore]);

  if (selectedCount === 0) return null;

  // ── Desktop layout: all actions in a horizontal bar ──────────────
  if (!narrow) {
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slide-up max-w-[calc(100vw-1rem)]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 dark:bg-gray-800 text-white rounded-2xl shadow-2xl border border-white/10 overflow-x-auto scrollbar-none flex-nowrap">
          {/* Count */}
          <span className="text-sm font-medium whitespace-nowrap">
            已选 {selectedCount} / {totalCount}
          </span>

          <div className="w-px h-5 bg-white/20 shrink-0" />

          {/* Select all / deselect */}
          {selectedCount < totalCount ? (
            <button
              onClick={onSelectAll}
              className="text-sm text-blue-300 hover:text-blue-200 transition-colors whitespace-nowrap"
            >
              全选
            </button>
          ) : (
            <button
              onClick={onDeselectAll}
              className="text-sm text-gray-400 hover:text-gray-300 transition-colors whitespace-nowrap"
            >
              取消全选
            </button>
          )}

          <div className="w-px h-5 bg-white/20 shrink-0" />

          {/* Download selected */}
          <button
            onClick={onDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors whitespace-nowrap"
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors whitespace-nowrap"
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors whitespace-nowrap"
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors whitespace-nowrap"
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors whitespace-nowrap"
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors whitespace-nowrap"
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors whitespace-nowrap"
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors whitespace-nowrap"
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors whitespace-nowrap"
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
            <div className="flex items-center gap-2 shrink-0">
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm transition-colors whitespace-nowrap"
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
            className="p-1 text-gray-400 hover:text-white transition-colors ml-1 shrink-0"
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

  // ── Mobile layout: core actions + "More" dropdown ─────────────────
  const moreActions: { label: string; icon: JSX.Element; onClick?: () => void; show?: boolean }[] = [
    { label: '重命名', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>, onClick: onBatchRename, show: !!onBatchRename },
    { label: 'ZIP 下载', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>, onClick: onDownloadZip, show: !!onDownloadZip },
    { label: '复制链接', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>, onClick: onCopyLinks, show: !!onCopyLinks },
    { label: '复制直链', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>, onClick: onCopyDirectLinks, show: !!onCopyDirectLinks },
    { label: '复制', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>, onClick: onCopy, show: !!onCopy },
    { label: '重复', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>, onClick: onDuplicate, show: !!onDuplicate },
    { label: '压缩', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>, onClick: onCreateZip, show: !!onCreateZip },
    { label: '移动', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 4h4a2 2 0 012 2v14a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h4m4-2v4m0 0l-4-4m4 4l4-4" /></svg>, onClick: onMoveToFolder, show: !!onMoveToFolder },
  ];

  const visibleMoreActions = moreActions.filter((a) => a.show);
  const hasMoreActions = visibleMoreActions.length > 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 animate-slide-up" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-900 dark:bg-gray-800 text-white shadow-2xl border-t border-white/10">
        {/* Count */}
        <span className="text-xs font-medium shrink-0 mr-1">
          {selectedCount}/{totalCount}
        </span>

        {/* Select all / deselect */}
        {selectedCount < totalCount ? (
          <button
            onClick={onSelectAll}
            className="text-xs text-blue-300 hover:text-blue-200 transition-colors shrink-0"
          >
            全选
          </button>
        ) : (
          <button
            onClick={onDeselectAll}
            className="text-xs text-gray-400 hover:text-gray-300 transition-colors shrink-0"
          >
            取消
          </button>
        )}

        <div className="w-px h-4 bg-white/20 shrink-0 mx-1" />

        {/* Download */}
        <button
          onClick={onDownload}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs transition-colors shrink-0"
          title="下载选中文件"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          下载
        </button>

        {/* Delete */}
        {confirming ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-red-300 shrink-0">确认?</span>
            <button
              onClick={() => { onDelete(); setConfirming(false); }}
              className="px-2 py-1.5 bg-red-500 hover:bg-red-600 rounded-lg text-xs transition-colors shrink-0"
            >
              删除
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-2 py-1.5 text-xs text-gray-400 hover:text-white transition-colors shrink-0"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-xs transition-colors shrink-0"
            title="删除选中文件"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            删除
          </button>
        )}

        {/* Spacer to push More + Close to the right */}
        <div className="flex-1 min-w-[4px]" />

        {/* More dropdown */}
        {hasMoreActions && (
          <div ref={moreRef} className="relative">
            <button
              onClick={() => setShowMore((v) => !v)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs transition-colors shrink-0"
              title="更多操作"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01" />
              </svg>
              更多
            </button>

            {showMore && (
              <>
                {/* Bottom sheet backdrop */}
                <div
                  className="fixed inset-0 z-40 bg-black/40 animate-in fade-in duration-200"
                  onClick={() => setShowMore(false)}
                />
                {/* Bottom sheet */}
                <div className="fixed inset-x-0 bottom-0 z-50 animate-slide-up-bottom" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                  <div className="bg-gray-800 dark:bg-gray-900 rounded-t-2xl shadow-2xl border-t border-white/10 pb-2">
                    {/* Drag handle */}
                    <div className="flex justify-center pt-3 pb-1">
                      <div className="w-8 h-1 rounded-full bg-gray-500/50" />
                    </div>
                    {visibleMoreActions.map((action) => (
                      <button
                        key={action.label}
                        onClick={() => { action.onClick?.(); setShowMore(false); }}
                        className="w-full text-left px-5 py-3.5 text-sm text-gray-200 hover:bg-white/10 flex items-center gap-3 transition-colors active:bg-white/15"
                      >
                        <span className="text-gray-400 shrink-0">{action.icon}</span>
                        <span>{action.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Close */}
        <button
          onClick={onDeselectAll}
          className="p-1.5 text-gray-400 hover:text-white transition-colors shrink-0"
          title="取消选择"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
