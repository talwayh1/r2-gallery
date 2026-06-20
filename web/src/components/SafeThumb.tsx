import { useState, useCallback } from 'react';

interface Props {
  path: string;
  /** Optional extra className for the img element */
  className?: string;
  /** Size class of the parent container — used for the fallback icon size */
  containerSize?: 'sm' | 'md' | 'lg';
  /** If true, sets fetchpriority="high" and removes loading="lazy" for initial-viewport images */
  priority?: boolean;
}

const iconSizes: Record<string, string> = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-4xl',
};

/**
 * Image thumbnail with graceful fallback when the thumbnail fails to load.
 * Shows an SVG file icon instead of a broken image.
 * Shows a shimmer skeleton while the image is loading.
 * Uses decoding="async" for non-blocking decode and supports fetchpriority for viewport-prioritized images.
 */
const FallbackIcon = ({ size }: { size: string }) => (
  <div className={`w-full h-full flex items-center justify-center text-gray-400 ${size}`}>
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  </div>
);

const ShimmerSkeleton = () => (
  <div className="absolute inset-0 overflow-hidden">
  <div className="absolute inset-0 shimmer" />
  </div>
);

export default function SafeThumb({ path, className = 'w-full h-full object-cover', containerSize = 'md', priority = false }: Props) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => setFailed(true), []);

  if (failed) {
    return <FallbackIcon size={iconSizes[containerSize]} />;
  }

  return (
    <div className="relative w-full h-full">
      {!loaded && <ShimmerSkeleton />}
      <img
        src={`/api/thumb?path=${encodeURIComponent(path)}`}
        alt=""
        className={`${className} ${loaded ? 'img-fade-in' : 'opacity-0'}`}
        loading={priority ? undefined : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : undefined}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
}

/**
 * Same as SafeThumb but accepts a direct URL instead of a path.
 * Supports fetchpriority for initial-viewport images.
 */
export function SafeThumbUrl({ url, className = 'w-full h-full object-cover', containerSize = 'sm', priority = false }: { url: string; className?: string; containerSize?: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => setFailed(true), []);

  if (failed) {
    return <FallbackIcon size={containerSize === 'sm' ? 'text-xl' : containerSize === 'lg' ? 'text-4xl' : 'text-2xl'} />;
  }

  return (
    <div className="relative w-full h-full">
      {!loaded && <ShimmerSkeleton />}
      <img
        src={url}
        alt=""
        className={`${className} ${loaded ? 'img-fade-in' : 'opacity-0'}`}
        loading={priority ? undefined : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : undefined}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
}
