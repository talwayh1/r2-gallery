/**
 * Global type declarations for R2 Gallery.
 *
 * Augments the Window interface with custom methods exposed by the app
 * (e.g. PWA install, SW update, Telegram auth) so we never need
 * `(window as any).xxx` casts.
 */

declare global {
  interface Window {
    /**
     * Callback set by ServiceWorkerRegistration to trigger a pending
     * service-worker update (called after user clicks "Update").
     */
    applySWUpdate?: () => Promise<boolean>;

    /**
     * PWA install prompt handler. Returns true if the user accepted
     * the install prompt, false otherwise.
     */
    installPWA?: () => Promise<boolean>;

    /**
     * Telegram OAuth callback — assigned temporarily during login
     * so the Telegram widget can invoke it after authentication.
     */
    onTelegramAuth?: (user: Record<string, string>) => void;
  }

  interface Navigator {
    /**
     * Legacy userLanguage — used as fallback when navigator.language
     * is not set (some older browsers / environments).
     */
    userLanguage?: string;
  }

  interface HTMLInputElement {
    /**
     * Non-standard attribute for directory uploads.
     * `webkitdirectory` is the Chrome/Safari prefix; `directory` is
     * the standard attribute name. Both are declared for type safety
     * so we can avoid `@ts-ignore`.
     */
    webkitdirectory?: string;
  }
}

/**
 * Augment React's InputHTMLAttributes so that `webkitdirectory` is
 * accepted as a valid JSX prop on `<input>` elements.
 */
import 'react';
declare module 'react' {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string;
    directory?: string;
  }
}

export {};
