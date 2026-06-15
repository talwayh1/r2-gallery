import { useState, useEffect, useRef, useCallback } from 'react';
import { searchFiles, getFileUrl, type SearchResult } from '../api';

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

function getIcon(mime: string) {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime === 'application/pdf') return '📄';
  if (mime.startsWith('text/')) return '📝';
  return '📎';
}

/** Highlight matching text in a string */
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function SearchOverlay({ onClose, onNavigate, onOpenFile }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const data = await searchFiles(q, 30);
      setResults(data.results || []);
      setTotal(data.total || 0);
      setSelectedIndex(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      const r = results[selectedIndex];
      if (r) {
        if (r.mime.startsWith('image/') || r.mime.startsWith('video/')) {
          onOpenFile(r.path, r.mime);
        } else {
          onNavigate(r.dir);
        }
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div
        className="w-full max-w-2xl mx-4 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索所有文件..."
            className="flex-1 text-lg bg-transparent outline-none placeholder-gray-400 dark:placeholder-gray-500"
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <kbd className="hidden sm:inline-block text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
            </div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="py-12 text-center text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm">未找到匹配「{query}」的文件</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="py-2">
              <div className="px-4 py-1.5 text-xs text-gray-400 dark:text-gray-500">
                找到 {total} 个结果
              </div>
              {results.map((r, i) => (
                <button
                  key={r.path}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === selectedIndex
                      ? 'bg-blue-50 dark:bg-blue-900/30'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-750'
                  }`}
                  onClick={() => {
                    if (r.mime.startsWith('image/') || r.mime.startsWith('video/')) {
                      onOpenFile(r.path, r.mime);
                    } else {
                      onNavigate(r.dir);
                    }
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  {/* Thumbnail or icon */}
                  {r.mime.startsWith('image/') ? (
                    <img
                      src={getFileUrl(r.path)}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover shrink-0 bg-gray-100 dark:bg-gray-700"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-xl w-10 h-10 flex items-center justify-center shrink-0">{getIcon(r.mime)}</span>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      <HighlightText text={r.name} query={query} />
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                      {r.dir ? `📂 ${r.dir}` : '根目录'}
                      {r.size > 0 && <span className="ml-2">{formatSize(r.size)}</span>}
                    </div>
                  </div>

                  {/* Navigate to folder icon */}
                  <div className="shrink-0">
                    {r.mime.startsWith('image/') || r.mime.startsWith('video/') ? (
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {query.length < 2 && (
            <div className="py-8 text-center text-gray-400 text-sm">
              输入至少 2 个字符开始搜索
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-5 py-2.5 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400">
          <span className="flex items-center gap-1"><kbd className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">↑↓</kbd> 导航</span>
          <span className="flex items-center gap-1"><kbd className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">↵</kbd> 打开</span>
          <span className="flex items-center gap-1"><kbd className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  );
}
