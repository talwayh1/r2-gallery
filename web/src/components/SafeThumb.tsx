import { useState } from 'react';

interface Props {
  path: string;
  /** Optional extra className for the img element */
  className?: string;
  /** Size class of the parent container — used for the fallback icon size */
  containerSize?: 'sm' | 'md' | 'lg';
}

const iconSizes: Record<string, string> = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-4xl',
};

/**
 * Image thumbnail with graceful fallback when the thumbnail fails to load.
 * Shows a 📄 icon instead of a broken image.
 */
export default function SafeThumb({ path, className = 'w-full h-full object-cover', containerSize = 'md' }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={`w-full h-full flex items-center justify-center text-gray-400 ${iconSizes[containerSize]}`}>
        📄
      </div>
    );
  }

  return (
    <img
      src={`/api/thumb?path=${encodeURIComponent(path)}`}
      alt=""
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Same as SafeThumb but accepts a direct URL instead of a path.
 */
export function SafeThumbUrl({ url, className = 'w-full h-full object-cover', containerSize = 'md' }: { url: string; className?: string; containerSize?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={`w-full h-full flex items-center justify-center text-gray-400 ${containerSize === 'sm' ? 'text-xl' : containerSize === 'lg' ? 'text-4xl' : 'text-2xl'}`}>
        📄
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
