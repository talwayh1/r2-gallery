import { Component, type ErrorInfo, type ReactNode } from 'react';
import { withTranslation, type WithTranslation } from 'react-i18next';

interface Props extends WithTranslation {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { t } = this.props;

    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.message?.includes('Loading chunk') ||
        this.state.error?.message?.includes('ChunkLoadError') ||
        this.state.error?.message?.includes('Loading CSS chunk') ||
        this.state.error?.message?.includes('dynamically imported') ||
        (this.state.error?.message?.includes('Failed to fetch') &&
         this.state.error?.message?.includes('import'));

      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
            {/* Error icon */}
            <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {isChunkError ? t('error.chunkError.title') : t('error.boundary.title')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              {isChunkError
                ? t('error.chunkError.message')
                : t('error.boundary.message')}
            </p>

            {/* Error detail (collapsible) */}
            {this.state.error && !isChunkError && (
              <details className="mb-6 text-left">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300 select-none">
                  {t('error.boundary.details')}
                </summary>
                <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-900 rounded-lg text-xs text-red-600 dark:text-red-400 overflow-auto max-h-32 whitespace-pre-wrap break-all">
                  {this.state.error.message}
                  {this.state.error.stack && `\n\n${this.state.error.stack}`}
                </pre>
                <button
                  onClick={async () => {
                    const text = this.state.error?.message + '\n\n' + (this.state.error?.stack || '');
                    try {
                      await navigator.clipboard.writeText(text);
                      // Visual feedback via button text change — no toast dependency
                      const btn = document.activeElement as HTMLElement;
                      if (btn) {
                        const orig = btn.textContent;
                        btn.textContent = t('error.boundary.copied');
                        setTimeout(() => { btn.textContent = orig; }, 1500);
                      }
                    } catch {
                      // Fallback: select the error text for manual copy
                      const pre = document.querySelector('pre');
                      if (pre) {
                        const range = document.createRange();
                        range.selectNodeContents(pre);
                        const sel = window.getSelection();
                        sel?.removeAllRanges();
                        sel?.addRange(range);
                      }
                    }
                  }}
                  className="mt-2 w-full px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {t('error.boundary.copyError')}
                </button>
              </details>
            )}

            <div className="flex gap-3 justify-center">
              {!isChunkError && (
                <button
                  onClick={this.handleReset}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition-colors"
                >
                  {t('error.boundary.retry')}
                </button>
              )}
              <button
                onClick={this.handleReload}
                className="px-5 py-2.5 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-xl transition-colors"
              >
                {t('error.boundary.reload')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default withTranslation()(ErrorBoundary);
