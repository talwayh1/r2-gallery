import { useState, useEffect, useCallback, useRef } from 'react';
import { discoverMedia, getThumbUrl, type DiscoverFile } from '../api';

interface Props {
  onClose: () => void;
  onNavigate: (dir: string) => void;
  onOpenFile: (path: string, mime: string) => void;
}

function formatSize(bytes: number) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(ts: number) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function DiscoverPage({ onClose, onNavigate, onOpenFile }: Props) {
  const [files, setFiles] = useState<DiscoverFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const pageSize = 30;
  const loadingRef = useRef(false); // prevent concurrent loads

  const loadMore = useCallback(async (currentOffset: number) => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    const isInitial = currentOffset === 0;
    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      const data = await discoverMedia(pageSize, currentOffset);
      setFiles((prev) => isInitial ? data.files : [...prev, ...data.files]);
      setHasMore(data.hasMore);
      setTotal(data.total);
      setOffset(currentOffset + data.files.length);
    } catch (err) {
      console.error('Discover load error:', err);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadMore(0);
  }, [loadMore]);

  // Keyboard: ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingRef.current && hasMore) {
          // defer to avoid React-internal state-batch issues
          setTimeout(() => loadMore(offset), 100);
        }
      },
      { rootMargin: '600px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, offset, loadMore]);

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
            <h1 className="text-lg font-semibold">✨ 发现</h1>
            <p className="text-xs text-gray-400">
              {total > 0 ? `共 ${total} 个媒体文件` : '浏览最近上传的图片和视频'}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {files.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-lg font-medium">暂无媒体文件</p>
            <p className="text-sm">上传一些图片或视频开始浏览</p>
          </div>
        )}

        {/* Masonry-style grid */}
        <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 gap-3 space-y-3">
          {files.map((file) => {
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
                    {/* Shimmer placeholder */}
                    {!isLoaded && (
                      <div className="shimmer w-full aspect-square" />
                    )}
                    <img
                      src={getThumbUrl(file.path)}
                      alt={file.name}
                      loading="lazy"
                      className={`w-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0 absolute'}`}
                      onLoad={() => handleImageLoad(file.path)}
                    />
                  </>
                ) : isVideo ? (
                  <div className="w-full aspect-video flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                    <svg className="w-12 h-12 text-white/60" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span className="absolute bottom-2 right-2 px-2 py-0.5 text-[10px] font-bold bg-black/60 text-white rounded">
                      VIDEO
                    </span>
                  </div>
                ) : null}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <p className="text-white text-xs font-medium truncate">{file.name}</p>
                    <div className="flex items-center gap-2 mt-1 text-white/60 text-[10px]">
                      {file.dir && <span>📂 {file.dir}</span>}
                      {file.size > 0 && <span>{formatSize(file.size)}</span>}
                      {file.mtime > 0 && <span>{formatDate(file.mtime)}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Infinite scroll sentinel + loading indicator */}
        <div ref={sentinelRef} className="flex justify-center mt-8">
          {loadingMore && (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
              加载更多...
            </div>
          )}
        </div>

        {/* Initial loading */}
        {loading && files.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        )}
      </div>
    </div>
  );
}
