/**
 * UploadPanel — shows upload progress for all active/completed uploads.
 * Floating panel triggered by the upload button badge.
 * Inspired by ZPan's upload-queue UI.
 *
 * Features:
 * - Auto-scroll to latest active upload
 * - Striped animation on active progress bars
 * - "Clear completed" to dismiss done/failed/cancelled tasks
 */

import { useRef, useEffect } from 'react';
import { useUploadQueue, formatEta, formatSpeed, type UploadTask, type UploadTaskStatus } from '../hooks/useUploadQueue';
import { formatSize } from '../utils';
import { toast } from '../hooks/useToast';

function StatusIcon({ status }: { status: UploadTaskStatus }) {
  if (status === 'completed') {
    return <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>;
  }
  if (status === 'failed' || status === 'cancelled') {
    return <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
  }
  return <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
}

function StatusPill({ status }: { status: UploadTaskStatus }) {
  const cls = status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    : status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    : status === 'cancelled' ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  const label = status === 'completed' ? '完成' : status === 'failed' ? '失败' : status === 'cancelled' ? '取消' : '上传中';
  return <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}

function TaskRow({ task, onCancel, onRetry }: { task: UploadTask; onCancel: () => void; onRetry: () => void }) {
  const pct = task.total > 0 ? Math.round((Math.min(task.loaded, task.total) / task.total) * 100) : 0;
  const canCancel = task.status === 'queued' || task.status === 'uploading';
  const canRetry = task.status === 'failed' || task.status === 'cancelled';

  return (
    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <div className="flex items-start gap-3">
        {task.previewUrl ? (
          <div className="shrink-0 w-8 h-8 rounded overflow-hidden bg-gray-100 dark:bg-gray-700">
            <img src={task.previewUrl} alt="" className="w-full h-full object-cover img-fade-in" loading="lazy" decoding="async" />
          </div>
        ) : (
          <div className="mt-0.5 shrink-0"><StatusIcon status={task.status} /></div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium flex-1">{task.fileName}</p>
            <StatusPill status={task.status} />
            {canCancel && (
              <button onClick={onCancel} className="shrink-0 p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
            {canRetry && (
              <button onClick={onRetry} className="shrink-0 p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="重新上传">
                <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {formatSize(Math.min(task.loaded, task.total))} / {formatSize(task.total)}
            {task.speed > 0 && ` · ${formatSpeed(task.speed)}`}
            {task.status === 'uploading' && task.etaSeconds != null && ` · ${formatEta(task.etaSeconds)}`}
          </p>
          {/* Progress bar with animated stripes for active uploads */}
          <div className="mt-1.5 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                task.status === 'completed' ? 'bg-emerald-500' : task.status === 'failed' ? 'bg-red-500' : 'bg-blue-500 progress-stripes'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {task.status === 'failed' && task.error && (
            <p className="text-[11px] text-red-500 mt-1 line-clamp-2">{task.error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UploadPanel() {
  const { tasks, isOpen, setOpen, cancel, cancelAll, retry, retryAllFailed, dismissCompleted, hasActiveUploads, activeCount, completedCount, failedCount } = useUploadQueue();
  const listRef = useRef<HTMLDivElement>(null);
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll to the latest task when new ones arrive (newest at bottom)
  useEffect(() => {
    if (isOpen && tasks.length > 0 && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [isOpen, tasks.length]);

  // Auto-dismiss panel after all uploads complete (3s delay)
  const prevActiveRef = useRef(hasActiveUploads);
  useEffect(() => {
    // Transition from active to idle
    if (prevActiveRef.current && !hasActiveUploads && tasks.length > 0 && isOpen) {
      // Clear any existing timer
      if (autoDismissTimerRef.current) {
        clearTimeout(autoDismissTimerRef.current);
      }
      autoDismissTimerRef.current = setTimeout(() => {
        const total = tasks.length;
        const done = tasks.filter(t => t.status === 'completed').length;
        const failed = tasks.filter(t => t.status === 'failed').length;
        const cancelled = tasks.filter(t => t.status === 'cancelled').length;
        // Show summary toast
        if (done === total) {
          toast('success', `全部 ${total} 个文件上传完成`);
        } else if (failed === total) {
          toast('error', `全部 ${total} 个文件上传失败`);
        } else if (failed > 0) {
          toast('info', `上传完成：${done} 个成功，${failed} 个失败${cancelled > 0 ? `，${cancelled} 个取消` : ''}`);
        } else {
          toast('info', `上传完成（${total} 个${done > 0 ? `，${done} 个成功` : ''}${cancelled > 0 ? `，${cancelled} 个取消` : ''}）`);
        }
        // Auto-dismiss panel
        setOpen(false);
        autoDismissTimerRef.current = null;
      }, 3000);
    }
    prevActiveRef.current = hasActiveUploads;

    return () => {
      if (autoDismissTimerRef.current) {
        clearTimeout(autoDismissTimerRef.current);
        autoDismissTimerRef.current = null;
      }
    };
  }, [hasActiveUploads, tasks, isOpen, setOpen]);

  // Determine if we have any terminal tasks that could be cleared
  const terminalCount = tasks.filter(t =>
    t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled'
  ).length;

  if (!isOpen && tasks.length === 0) return null;

  return (
    <>
      {/* Backdrop */}
      {isOpen && <div className="fixed inset-0 z-40 animate-fade-in" onClick={() => setOpen(false)} />}

      {/* Panel — full-width on mobile, floating on desktop */}
      {isOpen && (
        <div className="animate-slide-up-bottom fixed bottom-0 left-0 right-0 sm:bottom-20 sm:right-6 sm:left-auto z-50 sm:w-80 max-h-[50vh] sm:max-h-[min(28rem,calc(100vh-6rem))] bg-white dark:bg-gray-800 rounded-t-xl sm:rounded-xl shadow-2xl border-t sm:border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-sm font-semibold">上传队列</h3>
              <p className="text-[11px] text-gray-400">
                {activeCount > 0 ? `${activeCount} 个上传中` : ''}
                {completedCount > 0 ? ` · ${completedCount} 个完成` : ''}
                {failedCount > 0 ? ` · ${failedCount} 个失败` : ''}
                {tasks.length > 0 && ` · 共 ${tasks.length} 个`}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {failedCount > 1 && (
                <button onClick={retryAllFailed} className="text-[11px] text-amber-600 dark:text-amber-400 hover:text-amber-700 px-2 py-1 rounded hover:bg-amber-50 dark:hover:bg-amber-900/20">
                  重试全部 ({failedCount})
                </button>
              )}
              {hasActiveUploads && (
                <button onClick={cancelAll} className="text-[11px] text-red-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
                  全部取消
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* Task list */}
          <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
            {tasks.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">暂无上传任务</div>
            ) : (
              <>
                {/* Clear completed button at top of list when there are done items */}
                {terminalCount > 0 && (
                  <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                    <button
                      onClick={dismissCompleted}
                      className="w-full py-1 text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      清空已完成 ({terminalCount})
                    </button>
                  </div>
                )}
              </>
            )}
            {/* This ensures tasks always render below the clear button */}
            {tasks.map(task => (
              <TaskRow key={task.id} task={task} onCancel={() => cancel(task.id)} onRetry={() => retry(task.id)} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
