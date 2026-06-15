import { useEffect, useCallback } from 'react';
import { getFileUrl } from '../api';

interface Props {
  path: string;
  mime: string;
  onClose: () => void;
}

export default function Lightbox({ path, mime, onClose }: Props) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  const url = getFileUrl(path);
  const name = path.split('/').pop() || '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white z-10"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* File name */}
      <div className="absolute top-4 left-4 text-white/70 text-sm z-10">{name}</div>

      {/* Content */}
      <div className="max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {mime.startsWith('image/') ? (
          <img
            src={url}
            alt={name}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            draggable={false}
          />
        ) : mime.startsWith('video/') ? (
          <video
            src={url}
            controls
            autoPlay
            className="max-w-full max-h-[90vh] rounded-lg"
          />
        ) : mime.startsWith('audio/') ? (
          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl">
            <p className="text-lg mb-4 text-gray-900 dark:text-white">{name}</p>
            <audio src={url} controls autoPlay className="w-full" />
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
