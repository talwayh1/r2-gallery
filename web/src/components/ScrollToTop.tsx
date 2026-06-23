import { useState, useEffect, useCallback } from 'react';

/**
 * Scroll-to-top floating button.
 * Appears when the user scrolls down past `threshold` px.
 * Positioned at bottom-left to avoid overlapping with the Upload FAB.
 * Smoothly fades in/out via CSS transitions.
 */
export default function ScrollToTop({ scrollRef }: { scrollRef?: React.RefObject<HTMLDivElement | null> }) {
  const [visible, setVisible] = useState(false);
  const threshold = 300;

  const onScroll = useCallback(() => {
    const el = scrollRef?.current;
    const scrollY = el ? el.scrollTop : window.scrollY || window.pageYOffset;
    setVisible(scrollY > threshold);
  }, [scrollRef]);

  useEffect(() => {
    const el = scrollRef?.current ?? window;
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [onScroll, scrollRef]);

  const scrollToTop = () => {
    const el = scrollRef?.current;
    if (el) {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <button
      onClick={scrollToTop}
      aria-label="返回顶部"
      title="返回顶部"
      style={{
        position: 'fixed',
        left: '1.5rem',
        bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        zIndex: 25,
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      }}
      className={`
        bg-blue-500 hover:bg-blue-600 text-white
        flex items-center justify-center
        transition-all duration-300 ease-in-out
        ${visible ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-75 pointer-events-none'}
      `}
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    </button>
  );
}
