import { getThumbUrl } from '../api';
import { useSafeImage } from '../hooks/useSafeImage';

interface Props {
  path: string;
  /** File mtime for thumbnail cache-busting — when a file is replaced (same name), a
   *  fresh mtime ensures the new thumbnail loads instead of the stale cached version. */
  mtime?: number;
  /** Optional extra className for the img element */
  className?: string;
  /** Size class of the parent container — used for the fallback icon size */
  containerSize?: 'sm' | 'md' | 'lg';
  /** If true, sets fetchpriority="high" and removes loading="lazy" for initial-viewport images */
  priority?: boolean;
}

const SIZE_MAP: Record<string, string> = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-4xl',
};

/**
 * Image thumbnail with graceful fallback when the thumbnail fails to load.
 * Shows an SVG file icon instead of a broken image.
 * Shows a shimmer skeleton while the image is loading.
 * Uses decoding="async" for non-blocking decode and supports fetchpriority for viewport-prioritized images.
 * Automatically retries failed loads up to 2 times with exponential backoff.
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

export default function SafeThumb({ path, mtime, className = 'w-full h-full object-cover', containerSize = 'md', priority = false }: Props) {
  const { failed, loaded, handleLoad, handleError, imgClasses, retryCount } = useSafeImage(path);

  if (failed) {
    return <FallbackIcon size={SIZE_MAP[containerSize]} />;
  }

  return (
    <div className="relative w-full h-full">
      {/* Shimmer skeleton — fades out smoothly when image loads (transition via opacity) */}
      <div
        className={`absolute inset-0 overflow-hidden transition-opacity duration-300 ${
          loaded ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="absolute inset-0 shimmer" />
      </div>
      <img
        key={`${path}:${retryCount}`}
        src={getThumbUrl(path, mtime)}
        alt=""
        className={`${className} ${imgClasses}`}
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
 * Automatically retries failed loads up to 2 times with exponential backoff.
 */
interface SafeThumbUrlProps {
  url: string;
  className?: string;
  containerSize?: 'sm' | 'md' | 'lg';
  priority?: boolean;
}

export function SafeThumbUrl({ url, className = 'w-full h-full object-cover', containerSize = 'sm', priority = false }: SafeThumbUrlProps) {
  const { failed, loaded, handleLoad, handleError, imgClasses, retryCount } = useSafeImage(url);

  if (failed) {
    return <FallbackIcon size={SIZE_MAP[containerSize]} />;
  }

  return (
    <div className="relative w-full h-full">
      {/* Shimmer skeleton — fades out smoothly when image loads */}
      <div
        className={`absolute inset-0 overflow-hidden transition-opacity duration-300 ${
          loaded ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="absolute inset-0 shimmer" />
      </div>
      <img
        key={`${url}:${retryCount}`}
        src={url}
        alt=""
        className={`${className} ${imgClasses}`}
        loading={priority ? undefined : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : undefined}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
}