import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getMemories, getThumbUrl, type MemoryYear, type DiscoverFile } from '../api';

interface Props {
  onClose: () => void;
  onNavigate: (dir: string) => void;
  onOpenFile: (path: string, mime: string) => void;
}

import { formatSize } from '../utils';

/** Friendly label for "years ago" — call with t() inside component */
function yearsAgoLabel(t: (key: string, opts?: any) => string, n: number): string {
  if (n === 0) return t('memories.thisYear');
  if (n === 1) return t('memories.lastYear');
  if (n === 2) return t('memories.yearBefore');
  return t('memories.yearsAgo', { n });
}

/** Format mtime for Memories display with Chinese locale */
function formatDate(ts: number) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Emoji for years ago milestones */
function yearsAgoEmoji(n: number) {
  if (n === 0) return '🆕';
  if (n === 1) return '📅';
  if (n === 2) return '🌟';
  if (n <= 5) return '💎';
  if (n <= 10) return '🏆';
  return <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}

/** Video poster thumbnail with shimmer, fallback gradient, and play icon overlay */
function MemoriesVideoPoster({ file }: { file: { path: string; mime: string; mtime: number } }) {
  const [posterLoaded, setPosterLoaded] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  useEffect(() => {
    setPosterLoaded(false);
    setPosterFailed(false);
  }, [file.path]);

  return (
    <div className="w-full relative">
      {posterFailed ? (
        <div className="w-full aspect-video flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
          <svg className="w-12 h-12 text-white/60" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      ) : (
        <>
          {!posterLoaded && <div className="shimmer w-full aspect-video" />}
          <img
            src={getThumbUrl(file.path, file.mtime)}
            alt=""
            loading="lazy"
            decoding="async"
            className={`w-full object-cover transition-opacity duration-300 ${posterLoaded ? 'opacity-100' : 'opacity-0 absolute'}`}
            onLoad={() => setPosterLoaded(true)}
            onError={() => setPosterFailed(true)}
          />
        </>
      )}
      {/* Play icon overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center">
          <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
      <span className="absolute bottom-2 right-2 px-2 py-0.5 text-[10px] font-bold bg-black/60 text-white rounded z-10">
        VIDEO
      </span>
    </div>
  );
}

export default function MemoriesPage({ onClose, onNavigate, onOpenFile }: Props) {
  const { t } = useTranslation();
  const [memories, setMemories] = useState<MemoryYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState('');
  const [total, setTotal] = useState(0);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getMemories();
      setMemories(data.memories);
      setDate(data.date);
      setTotal(data.total);
    } catch (err) {
      console.error('Memories load error:', err);
      setLoadError(t('memories.loadError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  // Keyboard: ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleImageLoad = (path: string) => {
    setLoadedImages((prev) => new Set(prev).add(path));
  };

  return (
    <div className="fixed inset-0 z-40 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">{t('memories.title')}</h1>
            <p className="text-xs text-gray-400">
              {date && t('memories.subtitle', { date })}
              {total > 0 && t('memories.files', { count: total })}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Error state */}
        {loadError && !loading && memories.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-lg font-medium">{loadError}</p>
            <button
              onClick={loadMemories}
              className="mt-4 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
            >
              {t('memories.reload')}
            </button>
          </div>
        )}

        {/* Initial loading */}
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        )}

        {/* Empty state */}
        {!loading && !loadError && memories.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-lg font-medium">{t('memories.empty')}</p>
            <p className="text-sm">{t('memories.empty.hint')}</p>
            <p className="text-xs text-gray-300 mt-2">{t('memories.empty.footerHint')}</p>
          </div>
        )}

        {/* Memories grouped by year */}
        {memories.map((group) => (
          <div key={group.year} className="mb-10">
            {/* Year header */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">{yearsAgoEmoji(group.yearsAgo)}</span>
              <div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
                  {t('memories.year', { year: group.year })}
                </h2>
                <p className="text-sm text-gray-400">
                  {yearsAgoLabel(t, group.yearsAgo)} · {t('memories.fileCount', { count: group.files.length })}
                </p>
              </div>
            </div>

            {/* Media grid */}
            <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 gap-3 space-y-3">
              {group.files.map((file) => {
                const isImage = file.mime.startsWith('image/');
                const isVideo = file.mime.startsWith('video/');
                const isLoaded = loadedImages.has(file.path);

                return (
                  <div
                    key={file.path}
                    className="break-inside-avoid group relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer"
                    onClick={() => onOpenFile(file.path, file.mime)}
                  >
                    {isImage ? (
                      <>
                        {!isLoaded && <div className="shimmer w-full aspect-square" />}
                        <img
                          src={getThumbUrl(file.path, file.mtime)}
                          alt={file.name}
                          loading="lazy"
                          decoding="async"
                          className={`w-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0 absolute'}`}
                          onLoad={() => handleImageLoad(file.path)}
                        />
                      </>
                    ) : isVideo ? (
                      <MemoriesVideoPoster file={file} />
                    ) : null}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="text-white text-xs font-medium truncate">{file.name}</p>
                        <div className="flex items-center gap-2 mt-1 text-white/60 text-[10px]">
                          {file.dir && <span className="inline-flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>{file.dir}</span>}
                          {file.size > 0 && <span>{formatSize(file.size)}</span>}
                          {file.mtime > 0 && <span>{formatDate(file.mtime)}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Footer hint */}
        {!loading && !loadError && memories.length > 0 && (
          <div className="text-center py-8 text-gray-300 dark:text-gray-600 text-xs">
            {t('memories.footer')}
          </div>
        )}
      </div>
    </div>
  );
}
