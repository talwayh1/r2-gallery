/**
 * FileTypeIcon — Colored SVG icons for file types.
 * Replaces emoji-based file type indicators with professional SVG icons.
 * Each type gets a distinct color + icon shape for quick visual scanning.
 */

const TYPE_COLORS: Record<string, string> = {
  image: '#6366f1', // indigo
  video: '#a855f7', // purple
  audio: '#22c55e', // green
  pdf: '#ef4444', // red
  text: '#3b82f6', // blue
  sheet: '#22c55e', // green
  presentation: '#f97316', // orange
  archive: '#eab308', // yellow
  epub: '#ec4899', // pink
  dir: '#6366f1', // indigo
};

function mimeColor(mime: string): string {
  if (mime.startsWith('image/')) return TYPE_COLORS.image;
  if (mime.startsWith('video/')) return TYPE_COLORS.video;
  if (mime.startsWith('audio/')) return TYPE_COLORS.audio;
  if (mime === 'application/pdf') return TYPE_COLORS.pdf;
  if (mime.startsWith('text/') || mime.includes('word') || mime.includes('document')) return TYPE_COLORS.text;
  if (mime.includes('sheet') || mime.includes('excel')) return TYPE_COLORS.sheet;
  if (mime.includes('presentation') || mime.includes('powerpoint')) return TYPE_COLORS.presentation;
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z') || mime.includes('gzip')) return TYPE_COLORS.archive;
  if (mime.includes('epub')) return TYPE_COLORS.epub;
  return '#6b7280'; // gray
}

interface FileTypeIconProps {
  mime: string;
  className?: string;
  isDir?: boolean;
}

export default function FileTypeIcon({ mime, className = 'w-10 h-10', isDir = false }: FileTypeIconProps) {
  if (isDir) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none">
        <path d="M6 40V12a4 4 0 014-4h10l4 4h14a4 4 0 014 4v24a4 4 0 01-4 4H10a4 4 0 01-4-4z" stroke={TYPE_COLORS.dir} strokeWidth="2.5" fill={TYPE_COLORS.dir + '18'} />
      </svg>
    );
  }
  const c = mimeColor(mime);

  if (mime.startsWith('image/')) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none">
        <rect x="6" y="8" width="36" height="32" rx="4" stroke={c} strokeWidth="2.5" fill={c + '18'} />
        <circle cx="16" cy="20" r="3.5" fill={c} />
        <path d="M6 32l10-8 8 6 8-10 10 12" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (mime.startsWith('video/')) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none">
        <rect x="4" y="10" width="40" height="28" rx="4" stroke={c} strokeWidth="2.5" fill={c + '18'} />
        <polygon points="20,16 20,32 32,24" fill={c} />
      </svg>
    );
  }

  if (mime.startsWith('audio/')) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="18" stroke={c} strokeWidth="2.5" fill={c + '18'} />
        <path d="M20 30V16l12-2v14" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="17" cy="30" r="3" fill={c} />
        <circle cx="32" cy="28" r="3" fill={c} />
      </svg>
    );
  }

  if (mime === 'application/pdf') {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none">
        <rect x="8" y="4" width="32" height="40" rx="3" stroke={c} strokeWidth="2.5" fill={c + '18'} />
        <text x="24" y="32" textAnchor="middle" fill={c} fontSize="12" fontWeight="bold" fontFamily="Arial,sans-serif">PDF</text>
      </svg>
    );
  }

  if (mime.startsWith('text/') || mime.includes('word') || mime.includes('document')) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none">
        <rect x="8" y="4" width="32" height="40" rx="3" stroke={c} strokeWidth="2.5" fill={c + '18'} />
        <line x1="15" y1="18" x2="33" y2="18" stroke={c} strokeWidth="2" strokeLinecap="round" />
        <line x1="15" y1="24" x2="33" y2="24" stroke={c} strokeWidth="2" strokeLinecap="round" />
        <line x1="15" y1="30" x2="27" y2="30" stroke={c} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (mime.includes('sheet') || mime.includes('excel')) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none">
        <rect x="8" y="4" width="32" height="40" rx="3" stroke={c} strokeWidth="2.5" fill={c + '18'} />
        <line x1="15" y1="16" x2="33" y2="16" stroke={c} strokeWidth="2" strokeLinecap="round" />
        <line x1="15" y1="22" x2="33" y2="22" stroke={c} strokeWidth="2" strokeLinecap="round" />
        <line x1="15" y1="28" x2="33" y2="28" stroke={c} strokeWidth="2" strokeLinecap="round" />
        <line x1="20" y1="16" x2="20" y2="40" stroke={c} strokeWidth="1.5" strokeDasharray="2 2" />
      </svg>
    );
  }

  if (mime.includes('presentation') || mime.includes('powerpoint')) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none">
        <rect x="8" y="4" width="32" height="40" rx="3" stroke={c} strokeWidth="2.5" fill={c + '18'} />
        <rect x="14" y="14" width="20" height="16" rx="2" stroke={c} strokeWidth="1.8" fill={c + '10'} />
        <polygon points="28,18 34,22 28,26" fill={c} />
      </svg>
    );
  }

  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z') || mime.includes('gzip') || mime.includes('tar')) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none">
        <rect x="8" y="6" width="32" height="36" rx="3" stroke={c} strokeWidth="2.5" fill={c + '18'} />
        <line x1="12" y1="26" x2="36" y2="26" stroke={c} strokeWidth="2" strokeLinecap="round" />
        <rect x="20" y="16" width="8" height="6" stroke={c} strokeWidth="1.5" rx="1" fill={c + '15'} />
        <path d="M8 26l6-10h20l6 10" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (mime.includes('epub')) {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none">
        <rect x="8" y="4" width="32" height="40" rx="3" stroke={c} strokeWidth="2.5" fill={c + '18'} />
        <path d="M24 16v12m-4-4l4 4 4-4" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // Default: generic document
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none">
      <path d="M32 6H16a3 3 0 00-3 3v30a3 3 0 003 3h16a3 3 0 003-3V9a3 3 0 00-3-3z" stroke={c} strokeWidth="2.5" fill={c + '18'} />
      <path d="M28 6v8h8" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 20h12M18 26h8M18 32h10" stroke={c} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}