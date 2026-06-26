import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number, action?: { label: string; onClick: () => void }) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let globalAddToast: ((type: ToastType, message: string, duration?: number, action?: { label: string; onClick: () => void }) => void) | null = null;

/** Call this from anywhere to show a toast without hooks */
export function toast(type: ToastType, message: string, duration?: number, action?: { label: string; onClick: () => void }) {
  globalAddToast?.(type, message, duration, action);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const addToast = useCallback((type: ToastType, message: string, duration = 3000, action?: { label: string; onClick: () => void }) => {
    const id = `toast-${++counterRef.current}`;
    setToasts((prev) => {
      // Dedup: if same type+message exists, replace it (re-mount resets auto-dismiss timer)
      const deduped = prev.filter(t => t.type !== type || t.message !== message);
      const next = [...deduped, { id, type, message, duration, action }];
      // Keep max 3 visible toasts to avoid screen overflow
      return next.length > 3 ? next.slice(next.length - 3) : next;
    });
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Register global accessor
  useEffect(() => {
    globalAddToast = addToast;
    return () => { globalAddToast = null; };
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

/** Container that renders all active toasts */
function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center pointer-events-none max-w-sm w-full px-4">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
}

/** Individual toast with auto-dismiss, slide animation, and swipe-to-dismiss */
function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [swipeAnimating, setSwipeAnimating] = useState(false);
  const toastRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onRemove(toast.id), 200); // Wait for exit animation
    }, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onRemove]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
    setSwipeAnimating(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartRef.current === null) return;
    const dx = e.touches[0].clientX - touchStartRef.current;
    // Clamp to natural movement, apply rubber-band resistance beyond 150px
    const clamped = dx > 0 ? Math.min(dx, 150 + (dx - 150) * 0.3) : Math.max(dx, -(150 + Math.abs(dx + 150) * 0.3));
    setSwipeX(clamped);
  };

  const handleTouchEnd = () => {
    if (touchStartRef.current === null) return;
    touchStartRef.current = null;
    if (Math.abs(swipeX) > 80) {
      // Swipe far enough — dismiss
      setSwipeAnimating(true);
      setSwipeX(swipeX > 0 ? window.innerWidth : -window.innerWidth);
      setTimeout(() => onRemove(toast.id), 250);
    } else {
      // Snap back
      setSwipeAnimating(true);
      setSwipeX(0);
      setTimeout(() => setSwipeAnimating(false), 250);
    }
  };

  const icons: Record<ToastType, string> = {
    success: 'M5 13l4 4L19 7',
    error: 'M6 18L18 6M6 6l12 12',
    info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    warning: 'M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  };

  const colors: Record<ToastType, string> = {
    success: 'bg-green-500/90 dark:bg-green-600/90',
    error: 'bg-red-500/90 dark:bg-red-600/90',
    info: 'bg-blue-500/90 dark:bg-blue-600/90',
    warning: 'bg-yellow-500/90 dark:bg-yellow-600/90',
  };

  return (
    <div
      ref={toastRef}
      className={`
        pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg
        text-white text-sm font-medium backdrop-blur-sm
        ${colors[toast.type]}
        ${exiting ? 'animate-toast-exit' : 'animate-toast-enter'}
      `}
      style={{
        transform: swipeX !== 0 ? `translateX(${swipeX}px)` : undefined,
        transition: swipeAnimating ? 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : undefined,
        touchAction: 'pan-y',
      }}
      onClick={() => { if (!toast.action) { setExiting(true); setTimeout(() => onRemove(toast.id), 200); } }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      role="alert"
    >
      <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[toast.type]} />
      </svg>
      <span className="flex-1">{toast.message}</span>
      {toast.action && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toast.action!.onClick();
            setExiting(true);
            setTimeout(() => onRemove(toast.id), 200);
          }}
          className="shrink-0 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
