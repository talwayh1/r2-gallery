/**
 * Shared utility functions for r2-gallery.
 * Centralises helpers used across multiple components to reduce duplication.
 */

/**
 * Format bytes to a human-readable string.
 * Supports IEC (KiB/MiB) and JEDEC (KB/MB) standards via localStorage key `filesizeStandard`.
 *
 * @param bytes  File size in bytes
 * @param opts   Optional overrides
 * @returns      e.g. "1.5 MB", "2.0 GiB"
 */
export function formatSize(bytes: number, opts?: { emptyForZero?: boolean }): string {
  if (bytes <= 0) return opts?.emptyForZero ? '' : '0 B';
  const standard = localStorage.getItem('filesizeStandard') || 'jedec';
  const units = standard === 'iec'
    ? ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    : ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Format a Unix timestamp (seconds) to a locale date string.
 * Supports optional locale and formatting options for i18n.
 */
export function formatDate(ts: number, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions): string {
  if (!ts) return '';
  if (locales || options) {
    return new Date(ts * 1000).toLocaleDateString(locales, options);
  }
  return new Date(ts * 1000).toLocaleDateString();
}

/**
 * Get sort order index for file type grouping: image → video → audio → document → other.
 */
export function getKindOrder(mime: string): number {
  if (mime.startsWith('image/')) return 0;
  if (mime.startsWith('video/')) return 1;
  if (mime.startsWith('audio/')) return 2;
  if (
    mime === 'application/pdf' ||
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/javascript' ||
    mime === 'application/x-yaml'
  )
    return 3;
  return 4;
}

/**
 * Format a duration in seconds to m:ss format (e.g. "3:45").
 */
export function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Compute a human-readable aspect ratio string (e.g. "16:9") from pixel dimensions.
 */
export function getAspectRatio(w: number, h: number): string {
  if (!w || !h) return '';
  function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
  }
  const d = gcd(w, h);
  const ratio = w / h;
  if (Math.abs(ratio - 16 / 9) < 0.02) return '16:9';
  if (Math.abs(ratio - 4 / 3) < 0.02) return '4:3';
  if (Math.abs(ratio - 3 / 2) < 0.02) return '3:2';
  if (Math.abs(ratio - 1) < 0.02) return '1:1';
  if (Math.abs(ratio - 21 / 9) < 0.02) return '21:9';
  if (Math.abs(ratio - 9 / 16) < 0.02) return '9:16';
  const rw = w / d;
  const rh = h / d;
  if (rw > 50 || rh > 50) return `${ratio.toFixed(2)}:1`;
  return `${rw}:${rh}`;
}

/**
 * Generate a deterministic pastel HSL color from a file path string.
 * Each path always gets the same color — used for thumbnail loading placeholders
 * so each file has a unique, pleasant background color while the image loads.
 *
 * @param path  The file path used to derive the color
 * @returns     An HSL color string, e.g. "hsl(142, 72%, 78%)"
 */
export function getColorFromPath(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    hash = ((hash << 5) - hash) + path.charCodeAt(i);
    hash = hash | 0; // Force 32-bit integer
  }
  const hue = Math.abs(hash) % 360;
  const sat = 62 + (Math.abs(hash >> 8) % 16);  // 62–78%
  const light = 74 + (Math.abs(hash >> 16) % 12); // 74–86%
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

/**
 * Lightweight classnames helper — joins truthy class values with spaces.
 * Accepts strings, falsy values, and nested arrays of the same.
 * No external dependency needed; mirrors clsx for common use cases.
 *
 * @example
 * cn('px-4', isActive && 'bg-blue-500', 'py-2') // → "px-4 bg-blue-500 py-2"
 */
export function cn(...classes: (string | false | null | undefined | (string | false | null | undefined)[])[]): string {
  const parts: string[] = [];
  for (const c of classes) {
    if (Array.isArray(c)) {
      for (const sub of c) {
        if (sub) parts.push(sub);
      }
    } else if (c) {
      parts.push(c);
    }
  }
  return parts.join(' ');
}
