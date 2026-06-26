import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useTranslation } from 'react-i18next';

/**
 * A slim banner that slides down from the top of the main content area
 * when the browser goes offline. Slides back up when connectivity returns.
 * Stays visible at the top of the scroll area via sticky positioning.
 */
export default function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnlineStatus();

  // When online, render nothing (avoids layout shift from a hidden element)
  if (online) return null;

  return (
    <div
      className="sticky top-0 z-10 w-full bg-amber-500/90 dark:bg-amber-600/90 text-white text-xs font-medium
                 px-3 py-1.5 flex items-center justify-center gap-2 shadow-sm animate-slide-down"
      role="alert"
      aria-live="polite"
    >
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M18.364 5.636a9 9 0 010 12.728m-2.829-2.829a5 5 0 000-7.07m-4.243 4.243a1 1 0 010-1.414"
        />
        <line strokeLinecap="round" strokeWidth={2} x1="2" y1="2" x2="22" y2="22" />
      </svg>
      <span>{t('offline.title')}</span>
    </div>
  );
}