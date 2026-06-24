import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Scroll-to-top floating button with scroll progress ring.
 * Appears when the user scrolls down past `threshold` px.
 * The ring visually shows how far down the page you are.
 * Positioned at bottom-left to avoid overlapping with the Upload FAB.
 * Smoothly fades in/out via CSS transitions.
 */
export default function ScrollToTop({ scrollRef }: { scrollRef?: React.RefObject<HTMLDivElement | null> }) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const threshold = 300;
  const svgRef = useRef<SVGSVGElement>(null);

  const onScroll = useCallback(() => {
    const el = scrollRef?.current;
    const scrollY = el ? el.scrollTop : window.scrollY || window.pageYOffset;
    setVisible(scrollY > threshold);

    // Calculate scroll progress (0 = top, 100 = bottom)
    let maxScroll: number;
    if (el) {
      maxScroll = el.scrollHeight - el.clientHeight;
    } else {
      maxScroll = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    }
    if (maxScroll > 0) {
      setProgress(Math.min(scrollY / maxScroll, 1));
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

  const scrollToTop = () => {
    const el = scrollRef?.current;
    if (el) {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // SVG circle parameters for the progress ring
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

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
      {/* Arrow icon */}
      <svg className="w-6 h-6 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    </button>
  );
}
