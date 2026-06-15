import { useEffect, useCallback } from 'react';
import { getFileUrl } from '../api';

interface MediaItem {
  path: string;
  mime: string;
}

interface Props {
  items: MediaItem[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export default function Lightbox({ items, index, onClose, onNavigate }: Props) {
  const current = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

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
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose, goPrev, goNext]);

  if (!current) return null;

  const url = getFileUrl(current.path);
  const name = current.path.split('/').pop() || '';

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

      {/* File info */}
      <div className="absolute top-4 left-4 text-white/70 text-sm z-10 flex items-center gap-3">
        <span>{name}</span>
        <span className="text-white/40">({index + 1} / {items.length})</span>
      </div>

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
      <div className="max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {current.mime.startsWith('image/') ? (
          <img
            key={current.path}
            src={url}
            alt={name}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            draggable={false}
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
