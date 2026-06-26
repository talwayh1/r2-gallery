import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * ScrollToTopBottom — bidirectional floating button with scroll progress ring.
 *
 * Two modes:
 *  - scroll up (↑): appears when scrolled past `threshold` px, scrolls to top
 *  - scroll down (↓): appears near the top when the page is tall, scrolls to bottom
 *
 * The ring shows how far through the scrollable range you are (going up) or
 * how much remains (going down). Positioned at bottom-left to avoid overlap
 * with the Upload FAB. Smooth fade-in/out.
 */
export default function ScrollToTop({ scrollRef }: { scrollRef?: React.RefObject<HTMLDivElement | null> }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [goingDown, setGoingDown] = useState(false);
  const threshold = 300;
  const svgRef = useRef<SVGSVGElement>(null);

  const onScroll = useCallback(() => {
    const el = scrollRef?.current;
    const scrollY = el ? el.scrollTop : window.scrollY || window.pageYOffset;

    let maxScroll: number;
    if (el) {
      maxScroll = el.scrollHeight - el.clientHeight;
    } else {
      maxScroll = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    }

    if (maxScroll <= threshold) {
      // Page is too short to need a scroll button at all
      setVisible(false);
      return;
    }

    const nearTop = scrollY < threshold;
    // Show: near top → down-arrow; scrolled past threshold → up-arrow
    setGoingDown(nearTop);
    setVisible(true);

    if (maxScroll > 0) {
      // Down-arrow progress = scroll distance from bottom (0 = bottom, 1 = top)
      // Up-arrow progress = scroll distance from top (0 = top, 1 = bottom)
      setProgress(nearTop
        ? Math.min((maxScroll - scrollY) / maxScroll, 1)
        : Math.min(scrollY / maxScroll, 1)
      );
    } else {
      setProgress(0);
    }
  }, [scrollRef]);

  useEffect(() => {
    const el = scrollRef?.current ?? window;
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [onScroll, scrollRef]);

  const scrollTo = () => {
    const el = scrollRef?.current;
    if (el) {
      const target = goingDown ? el.scrollHeight : 0;
      el.scrollTo({ top: target, behavior: 'smooth' });
    } else {
      const target = goingDown
        ? document.documentElement.scrollHeight
        : 0;
      window.scrollTo({ top: target, behavior: 'smooth' });
    }
  };

  // SVG circle parameters for the progress ring
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <button
      onClick={scrollTo}
      aria-label={goingDown ? t('scrollToBottom', '滚动到底部') : t('scrollToTop')}
      title={goingDown ? t('scrollToBottom', '滚动到底部') : t('scrollToTop')}
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
      {/* Progress ring background */}
      <svg ref={svgRef} className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 48 48">
        <circle
          cx="24" cy="24" r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="3"
        />
        <circle
          cx="24" cy="24" r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
      </svg>
      {/* Arrow icon — direction depends on mode */}
      <svg className="w-6 h-6 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {goingDown ? (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        )}
      </svg>
    </button>
  );
}
