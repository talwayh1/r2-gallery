import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
}

interface ConfirmState {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

interface ConfirmContextValue {
  showConfirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const showConfirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ options, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (state) {
      setState(null);
      state.resolve(true);
    }
  }, [state]);

  const handleCancel = useCallback(() => {
    if (state) {
      setState(null);
      state.resolve(false);
    }
  }, [state]);

  return (
    <ConfirmContext.Provider value={{ showConfirm }}>
      {children}
      {state && (
        <ConfirmDialog
          options={state.options}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx.showConfirm;
}

/** Visual confirm dialog with backdrop, keyboard support, and mobile-friendly layout */
function ConfirmDialog({
  options,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const {
    title = '确认操作',
    message,
    confirmLabel = '确认删除',
    cancelLabel = '取消',
    variant = 'danger',
  } = options;

  const confirmColors: Record<string, string> = {
    danger:
      'bg-red-500 hover:bg-red-600 focus:ring-red-400 dark:bg-red-600 dark:hover:bg-red-700',
    warning:
      'bg-yellow-500 hover:bg-yellow-600 focus:ring-yellow-400 dark:bg-yellow-600 dark:hover:bg-yellow-700',
    info: 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-400 dark:bg-blue-600 dark:hover:bg-blue-700',
  };

  const iconColors: Record<string, string> = {
    danger: 'text-red-500 dark:text-red-400',
    warning: 'text-yellow-500 dark:text-yellow-400',
    info: 'text-blue-500 dark:text-blue-400',
  };

  const icons: Record<string, React.ReactNode> = {
    danger: (
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 9v2m0 4h.01M10.29 3.86l-8.07 14.03A1.75 1.75 0 003.75 20.5h16.5a1.75 1.75 0 001.53-2.61L13.71 3.86a1.75 1.75 0 00-3.42 0z"
        />
      </svg>
    ),
    warning: (
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    info: (
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
        if (e.key === 'Enter') onConfirm();
      }}
      tabIndex={0}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      // Auto-focus for keyboard capture
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 dark:bg-black/60 backdrop-blur-sm animate-fade-in" />

      {/* Dialog card */}
      <div
        className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-scale-in pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className={`flex justify-center mb-4 ${iconColors[variant]}`}>
          {icons[variant]}
        </div>

        {/* Title */}
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold text-center mb-2 text-gray-900 dark:text-gray-100"
        >
          {title}
        </h2>

        {/* Message */}
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6 whitespace-pre-wrap break-words leading-relaxed">
          {message}
        </p>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600
                       text-gray-700 dark:text-gray-300 font-medium text-sm
                       hover:bg-gray-50 dark:hover:bg-gray-700
                       active:scale-[0.98] transition-all duration-150
                       focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-500
                       min-h-[44px] touch-feedback"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-xl text-white font-medium text-sm
                        active:scale-[0.98] transition-all duration-150
                        focus:outline-none focus:ring-2 focus:ring-offset-2
                        dark:focus:ring-offset-gray-800
                        min-h-[44px] touch-feedback ${confirmColors[variant]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
