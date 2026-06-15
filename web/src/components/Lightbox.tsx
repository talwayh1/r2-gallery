import { useEffect, useCallback, useState } from 'react';
import { getFileUrl } from '../api';

interface MediaItem {
  path: string;
  mime: string;
  size?: number;
}

interface Props {
  items: MediaItem[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

function formatSize(bytes: number) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function Lightbox({ items, index, onClose, onNavigate }: Props) {
  const current = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;
  const [copied, setCopied] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null);

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigate(index - 1);
  }, [hasPrev, index, onNavigate]);

  const goNext = useCallback(() => {
    if (hasNext) onNavigate(index + 1);
  }, [hasNext, index, onNavigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goPrev(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goNext(); }
      else if (e.key === 'i') setShowInfo((s) => !s);
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose, goPrev, goNext]);

  // Reset state on navigation
  useEffect(() => {
    setCopied(false);
    setShowInfo(false);
    setImageLoaded(false);
    setImageDimensions(null);
  }, [index]);

  if (!current) return null;

  const url = getFileUrl(current.path);
  const name = current.path.split('/').pop() || '';
  const ext = name.split('.').pop()?.toUpperCase() || '';
  // Shareable /view/ URL for social media
  const viewUrl = `${window.location.origin}/view/${encodeURIComponent(current.path)}`;
  // Direct file URL for embedding
  const directUrl = `${window.location.origin}/api/file?path=${encodeURIComponent(current.path)}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(viewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = viewUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight });
    setImageLoaded(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white z-10"
        title="关闭 (Esc)"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* File info bar */}
      <div className="absolute top-4 left-4 text-white/70 text-sm z-10 flex items-center gap-3">
        <span className="font-medium text-white/90">{name}</span>
        {ext && <span className="px-1.5 py-0.5 text-[10px] bg-white/10 rounded">{ext}</span>}
        {current.size ? <span className="text-xs text-white/50">{formatSize(current.size)}</span> : null}
        {imageDimensions && (
          <span className="text-xs text-white/40">{imageDimensions.w} × {imageDimensions.h}</span>
        )}
        <span className="text-white/40">({index + 1} / {items.length})</span>
      </div>

      {/* Action buttons */}
      <div className="absolute top-4 right-16 flex items-center gap-1 z-10">
        {/* Info toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowInfo(!showInfo); }}
          className={`p-2 rounded-lg transition-colors ${showInfo ? 'text-blue-400 bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
          title="文件信息 (I)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        {/* Copy link */}
        <button
          onClick={(e) => { e.stopPropagation(); handleCopyLink(); }}
          className={`p-2 rounded-lg transition-colors ${copied ? 'text-green-400' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
          title={copied ? '已复制!' : '复制分享链接'}
        >
          {copied ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          )}
        </button>
        {/* Download */}
        <a
          href={url}
          download={name}
          onClick={(e) => e.stopPropagation()}
          className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          title="下载"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </a>
      </div>

      {/* Info panel */}
      {showInfo && (
        <div
          className="absolute top-16 right-4 bg-gray-900/95 backdrop-blur-md border border-white/10 rounded-xl p-4 z-10 min-w-[260px] text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <h4 className="text-white font-medium mb-3">文件信息</h4>
          <div className="space-y-2 text-white/70">
            <div className="flex justify-between gap-4">
              <span className="text-white/40">名称</span>
              <span className="text-right break-all">{name}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/40">类型</span>
              <span>{current.mime}</span>
            </div>
            {current.size ? (
              <div className="flex justify-between gap-4">
                <span className="text-white/40">大小</span>
                <span>{formatSize(current.size)}</span>
              </div>
            ) : null}
            {imageDimensions && (
              <div className="flex justify-between gap-4">
                <span className="text-white/40">尺寸</span>
                <span>{imageDimensions.w} × {imageDimensions.h} px</span>
              </div>
            )}
            {imageDimensions && (
              <div className="flex justify-between gap-4">
                <span className="text-white/40">宽高比</span>
                <span>{getAspectRatio(imageDimensions.w, imageDimensions.h)}</span>
              </div>
            )}
            {imageDimensions && (
              <div className="flex justify-between gap-4">
                <span className="text-white/40">百万像素</span>
                <span>{((imageDimensions.w * imageDimensions.h) / 1_000_000).toFixed(1)} MP</span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span className="text-white/40">路径</span>
              <span className="text-right break-all text-xs">{current.path}</span>
            </div>
          </div>
          <hr className="border-white/10 my-3" />
          {/* Share link */}
          <div className="space-y-2">
            <button
              onClick={handleCopyLink}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white/80"
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  已复制!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  复制分享链接
                </>
              )}
            </button>
            {/* Direct image link */}
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(directUrl);
                } catch { /* silent */ }
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-white/50 text-xs"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              复制图片直链
            </button>
          </div>
        </div>
      )}

      {/* Previous button */}
      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10"
          title="上一张 (←)"
        >
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Next button */}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10"
          title="下一张 (→)"
        >
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Content */}
      <div className="max-w-[90vw] max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
        {/* Loading spinner for lightbox image */}
        {current.mime.startsWith('image/') && !imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white/50" />
          </div>
        )}

        {current.mime.startsWith('image/') ? (
          <img
            key={current.path}
            src={url}
            alt={name}
            className={`max-w-full max-h-[90vh] object-contain rounded-lg transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            draggable={false}
            onLoad={handleImageLoad}
          />
        ) : current.mime.startsWith('video/') ? (
          <video
            key={current.path}
            src={url}
            controls
            autoPlay
            className="max-w-full max-h-[90vh] rounded-lg"
          />
        ) : current.mime.startsWith('audio/') ? (
          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl">
            <p className="text-lg mb-4 text-gray-900 dark:text-white">{name}</p>
            <audio key={current.path} src={url} controls autoPlay className="w-full" />
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl text-center">
            <p className="text-lg mb-4 text-gray-900 dark:text-white">{name}</p>
            <a
              href={url}
              download={name}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Download
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/** Compute a human-readable aspect ratio string */
function getAspectRatio(w: number, h: number): string {
  function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
  }
  const d = gcd(w, h);
  const rw = w / d;
  const rh = h / d;
  // Simplify common ratios
  const ratio = w / h;
  if (Math.abs(ratio - 16 / 9) < 0.02) return '16:9';
  if (Math.abs(ratio - 4 / 3) < 0.02) return '4:3';
  if (Math.abs(ratio - 3 / 2) < 0.02) return '3:2';
  if (Math.abs(ratio - 1) < 0.02) return '1:1';
  if (Math.abs(ratio - 21 / 9) < 0.02) return '21:9';
  if (Math.abs(ratio - 9 / 16) < 0.02) return '9:16';
  // For large numbers, simplify to common approximations
  if (rw > 50 || rh > 50) return `${ratio.toFixed(2)}:1`;
  return `${rw}:${rh}`;
}
