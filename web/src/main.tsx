import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './hooks/useToast';
import { ConfirmProvider } from './hooks/useConfirm';
import { initMobileCompat } from './utils/mobile';
import './styles/global.css';
import './i18n';

// Initialize mobile/WeChat compatibility fixes early
initMobileCompat();

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Periodic update check every 10 minutes, with error logging
      setInterval(() => {
        reg.update().catch((err) => console.warn('SW update check failed:', err));
      }, 10 * 60 * 1000);

      // Detect new service worker waiting to activate
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          // 'installed' + existing controller = new version deployed
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('sw-update'));
          }
        });
      });
    }).catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}

// Global handler to apply SW update when user confirms
window.applySWUpdate = async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg?.waiting) return false;
  reg.waiting.postMessage('skipWaiting');
  // Reload when the new SW takes over
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
  return true;
};

// Define the BeforeInstallPromptEvent interface (not part of standard TS lib types)
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  prompt(): Promise<void>;
}

// Capture PWA install prompt for custom install UI
let deferredPrompt: BeforeInstallPromptEvent | null = null;
window.addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
});

// Expose install function globally
window.installPWA = async (): Promise<boolean> => {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
