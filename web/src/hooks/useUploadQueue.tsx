/**
 * Upload Queue — manages concurrent file uploads with progress tracking.
 * Inspired by ZPan's upload queue architecture.
 *
 * Features:
 * - Max 3 concurrent uploads
 * - Per-file progress (loaded/total/speed/ETA)
 * - AbortController for cancellation
 * - beforeunload safety
 */

import { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect, type ReactNode } from 'react';

export type UploadTaskStatus = 'queued' | 'uploading' | 'completed' | 'failed' | 'cancelled';

export interface UploadRunnerContext {
  signal: AbortSignal;
  onProgress: (loaded: number, total: number) => void;
}

export interface UploadTask {
  id: string;
  fileName: string;
  size: number;
  status: UploadTaskStatus;
  loaded: number;
  total: number;
  speed: number;
  etaSeconds: number | null;
  error?: string;
  /** Blob URL for image preview — cleaned up when task is dismissed */
  previewUrl?: string;
}

interface InternalTask extends UploadTask {
  run: (ctx: UploadRunnerContext) => Promise<void>;
  controller?: AbortController;
  /** Number of times this task has been auto-retried after failure */
  retryCount: number;
}

export interface UploadQueueInput {
  file: File;
  relativePath?: string;
  previewUrl?: string;
  run: (ctx: UploadRunnerContext) => Promise<void>;
}

interface UploadQueueValue {
  tasks: UploadTask[];
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  enqueue: (items: UploadQueueInput[], onBatchComplete?: (hadSuccess: boolean) => void) => void;
  cancel: (id: string) => void;
  cancelAll: () => void;
  /** Retry a failed or cancelled upload */
  retry: (id: string) => void;
  /** Remove all completed/failed/cancelled tasks from the list */
  dismissCompleted: () => void;
  hasActiveUploads: boolean;
  activeCount: number;
  completedCount: number;
  failedCount: number;
}

const MAX_CONCURRENT = 3;
/** How many times to auto-retry a failed upload before giving up */
const MAX_UPLOAD_RETRIES = 2;
const UploadQueueContext = createContext<UploadQueueValue | null>(null);

function isActive(s: UploadTaskStatus) {
  return s === 'queued' || s === 'uploading';
}

function isRunning(s: UploadTaskStatus) {
  return s === 'uploading';
}

function makeId() {
  return `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatEta(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  if (seconds < 1) return '<1s';
  const r = Math.ceil(seconds);
  if (r < 60) return `${r}s`;
  const m = Math.floor(r / 60);
  const s = r % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(1024));
  return `${(bytesPerSec / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [isOpen, setOpen] = useState(false);
  const tasksRef = useRef<InternalTask[]>([]);
  const batchRef = useRef<Map<string, { ids: Set<string>; onDone: (ok: boolean) => void }>>(new Map());

  const publish = useCallback(() => {
    setTasks(tasksRef.current.map(({ run: _, controller: __, ...t }) => ({ ...t })));
  }, []);

  const updateTask = useCallback((id: string, patch: Partial<InternalTask>) => {
    const t = tasksRef.current.find(x => x.id === id);
    if (t) { Object.assign(t, patch); }
    publish();
  }, [publish]);

  const settleBatches = useCallback(() => {
    for (const [bid, batch] of batchRef.current) {
      const batchTasks = tasksRef.current.filter(t => batch.ids.has(t.id));
      if (batchTasks.length === 0 || batchTasks.some(t => isActive(t.status))) continue;
      batchRef.current.delete(bid);
      batch.onDone(batchTasks.some(t => t.status === 'completed'));
    }
  }, []);

  const maybeStartNext = useCallback(() => {
    const running = tasksRef.current.filter(t => isRunning(t.status)).length;
    const slots = MAX_CONCURRENT - running;
    if (slots <= 0) return;

    const next = tasksRef.current.filter(t => t.status === 'queued').slice(0, slots);
    for (const task of next) {
      const controller = new AbortController();
      task.controller = controller;
      task.status = 'uploading';

      const startedAt = Date.now();
      task.run({
        signal: controller.signal,
        onProgress: (loaded, total) => {
          const elapsed = Math.max((Date.now() - startedAt) / 1000, 0.001);
          const speed = loaded / elapsed;
          const remaining = Math.max(total - loaded, 0);
          updateTask(task.id, {
            loaded: Math.min(loaded, total),
            total,
            speed,
            etaSeconds: speed > 0 && remaining > 0 ? remaining / speed : null,
          });
        },
      }).then(() => {
        updateTask(task.id, {
          status: controller.signal.aborted ? 'cancelled' : 'completed',
          loaded: task.total,
          speed: 0,
          etaSeconds: null,
          error: undefined, // Clear any previous retry message
        });
      }).catch((err) => {
        const isAborted = controller.signal.aborted;
        if (!isAborted && task.retryCount < MAX_UPLOAD_RETRIES) {
          // Auto-retry on transient failure (network blip, server hiccup, etc.)
          task.retryCount += 1;
          updateTask(task.id, {
            status: 'queued',
            error: `Retry ${task.retryCount}/${MAX_UPLOAD_RETRIES}: ${err instanceof Error ? err.message : String(err)}`,
            loaded: 0,
            speed: 0,
            etaSeconds: null,
          });
        } else {
          updateTask(task.id, {
            status: isAborted ? 'cancelled' : 'failed',
            error: err instanceof Error ? err.message : String(err),
            speed: 0,
            etaSeconds: null,
          });
        }
      }).finally(() => {
        task.controller = undefined;
        settleBatches();
        maybeStartNext();
      });
    }
    publish();
  }, [publish, settleBatches, updateTask]);

  const enqueue = useCallback((items: UploadQueueInput[], onBatchComplete?: (ok: boolean) => void) => {
    if (items.length === 0) return;
    const newTasks: InternalTask[] = items.map(item => ({
      id: makeId(),
      fileName: item.file.name,
      size: item.file.size,
      status: 'queued' as const,
      loaded: 0,
      total: item.file.size,
      speed: 0,
      etaSeconds: null,
      previewUrl: item.previewUrl,
      run: item.run,
      retryCount: 0,
    }));
    tasksRef.current = [...tasksRef.current, ...newTasks];
    if (onBatchComplete) {
      batchRef.current.set(makeId(), {
        ids: new Set(newTasks.map(t => t.id)),
        onDone: onBatchComplete,
      });
    }
    setOpen(true);
    publish();
    maybeStartNext();
  }, [maybeStartNext, publish]);

  const cancel = useCallback((id: string) => {
    const task = tasksRef.current.find(t => t.id === id);
    if (!task || !isActive(task.status)) return;
    task.controller?.abort();
    updateTask(id, { status: 'cancelled' });
    settleBatches();
  }, [settleBatches, updateTask]);

  const cancelAll = useCallback(() => {
    for (const t of tasksRef.current) {
      if (isActive(t.status)) {
        t.controller?.abort();
        t.status = 'cancelled';
      }
    }
    publish();
    settleBatches();
  }, [publish, settleBatches]);

  const retry = useCallback((id: string) => {
    const task = tasksRef.current.find(t => t.id === id);
    if (!task) return;
    // Only allow retrying failed or cancelled tasks
    if (task.status !== 'failed' && task.status !== 'cancelled') return;
    task.status = 'queued';
    task.loaded = 0;
    task.speed = 0;
    task.etaSeconds = null;
    task.error = undefined;
    task.controller = undefined;
    task.retryCount = 0; // Reset auto-retry counter for fresh manual attempt
    publish();
    maybeStartNext();
  }, [publish, maybeStartNext]);

  const dismissCompleted = useCallback(() => {
    // Revoke object URLs for dismissed tasks to avoid memory leaks
    for (const t of tasksRef.current) {
      if (t.status !== 'queued' && t.status !== 'uploading' && t.previewUrl) {
        try { URL.revokeObjectURL(t.previewUrl); } catch { /* noop */ }
      }
    }
    tasksRef.current = tasksRef.current.filter(t =>
      t.status === 'queued' || t.status === 'uploading'
    );
    // Clean up orphaned batch references
    for (const [bid, batch] of batchRef.current) {
      const remaining = tasksRef.current.filter(t => batch.ids.has(t.id));
      if (remaining.length === 0) {
        batchRef.current.delete(bid);
      }
    }
    publish();
  }, [publish]);

  const hasActiveUploads = tasks.some(t => isActive(t.status));
  const activeCount = tasks.filter(t => isActive(t.status)).length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const failedCount = tasks.filter(t => t.status === 'failed').length;

  // Warn before leaving with active uploads
  useEffect(() => {
    if (!hasActiveUploads) return;
    const handler = (e: BeforeUnloadEvent) => {
      cancelAll();
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [cancelAll, hasActiveUploads]);

  const value = useMemo(() => ({
    tasks, isOpen, setOpen, enqueue, cancel, cancelAll, retry, dismissCompleted,
    hasActiveUploads, activeCount, completedCount, failedCount,
  }), [tasks, isOpen, setOpen, enqueue, cancel, cancelAll, retry, dismissCompleted, hasActiveUploads, activeCount, completedCount, failedCount]);

  return <UploadQueueContext.Provider value={value}>{children}</UploadQueueContext.Provider>;
}

export function useUploadQueue() {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) throw new Error('useUploadQueue must be used within UploadQueueProvider');
  return ctx;
}

export { formatEta, formatSpeed };
