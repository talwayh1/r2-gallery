/**
 * Mobile & WeChat Browser Compatibility Utilities
 * Handles iOS quirks, WeChat-specific behavior, and touch optimizations
 */

/** Detect if running inside WeChat browser */
export function isWeChat(): boolean {
  return /MicroMessenger/i.test(navigator.userAgent);
}

/** Detect if running on iOS */
export function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Detect if running on Android */
export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

/** Detect if device is mobile */
export function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768;
}

/** Initialize mobile compatibility fixes */
export function initMobileCompat(): void {
  // Add WeChat class to html for CSS targeting
  if (isWeChat()) {
    document.documentElement.classList.add('wechat-browser');
  }

  // Add platform classes
  if (isIOS()) document.documentElement.classList.add('ios');
  if (isAndroid()) document.documentElement.classList.add('android');

  // Fix iOS keyboard push-up issue
  if (isIOS()) {
    document.body.addEventListener('focusout', () => {
      setTimeout(() => {
        window.scrollTo(0, document.documentElement.scrollTop || document.body.scrollTop);
      }, 100);
    });
  }

  // Prevent double-tap zoom on mobile
  if (isMobile()) {
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    }, { passive: false });
  }

  // Fix Android keyboard resize
  if (isAndroid()) {
    const originalHeight = window.innerHeight;
    window.addEventListener('resize', () => {
      const currentHeight = window.innerHeight;
      // Keyboard opened
      if (currentHeight < originalHeight * 0.75) {
        document.body.classList.add('keyboard-open');
      } else {
        document.body.classList.remove('keyboard-open');
      }
    });
  }

  // Optimize touch events
  if ('ontouchstart' in window) {
    document.documentElement.classList.add('touch-device');
  }
}

/** Scroll element into view on mobile (for input focus) */
export function scrollIntoViewIfNeeded(element: HTMLElement): void {
  if (!isMobile()) return;

  setTimeout(() => {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, 300);
}

/** Get viewport height accounting for mobile browser chrome */
export function getViewportHeight(): number {
  if (isIOS()) {
    return window.innerHeight;
  }
  return window.visualViewport?.height || window.innerHeight;
}

/** Lock body scroll (for modals) */
export function lockScroll(): void {
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.width = '100%';
  document.body.style.top = `-${window.scrollY}px`;
}

/** Unlock body scroll */
export function unlockScroll(): void {
  const scrollY = document.body.style.top;
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.width = '';
  document.body.style.top = '';
  if (scrollY) {
    window.scrollTo(0, parseInt(scrollY || '0', 10) * -1);
  }
}

/** Detect if device supports hover */
export function hasHover(): boolean {
  return window.matchMedia('(hover: hover)').matches;
}

/** Get safe area insets */
export function getSafeAreaInsets(): { top: number; bottom: number; left: number; right: number } {
  const style = getComputedStyle(document.documentElement);
  return {
    top: parseInt(style.getPropertyValue('env(safe-area-inset-top)') || '0', 10),
    bottom: parseInt(style.getPropertyValue('env(safe-area-inset-bottom)') || '0', 10),
    left: parseInt(style.getPropertyValue('env(safe-area-inset-left)') || '0', 10),
    right: parseInt(style.getPropertyValue('env(safe-area-inset-right)') || '0', 10),
  };
}

/** Add haptic feedback if available */
export function hapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light'): void {
  if ('vibrate' in navigator) {
    const durations = { light: 10, medium: 20, heavy: 30 };
    navigator.vibrate(durations[type]);
  }
}
