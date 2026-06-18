import { useState, useEffect, useRef, useCallback } from 'react';
import { searchFiles, getFileUrl, getThumbUrl, type SearchResult } from '../api';

interface Props {
  onClose: () => void;
  onNavigate: (dir: string) => void;
  onOpenFile: (path: string, mime: string) => void;
}

const RECENT_SEARCHES_KEY = 'recentSearches';
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addRecentSearch(query: string) {
  const recent = getRecentSearches().filter(s => s !== query);
  recent.unshift(query);
  if (recent.length > MAX_RECENT) recent.pop();
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent));
  } catch { /* ignore quota errors */ }
}

function clearRecentSearches() {
  localStorage.removeItem(RECENT_SEARCHES_KEY);
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>(getRecentSearches);
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
  const doSearch = useCallback(async (q: string, appendOffset?: number) => {
    if (q.length < 2) {
      setResults([]);
      setTotal(0);
      return;
    }
    if (appendOffset != null) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const limit = 30;
      const data = await searchFiles(q, limit, appendOffset || 0);
      if (appendOffset != null) {
        setResults(prev => [...prev, ...(data.results || [])]);
      } else {
        setResults(data.results || []);
      }
      setTotal(data.total || 0);
      setSelectedIndex(0);
    } catch {
      if (!appendOffset) setResults([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length >= 2) {
      debounceRef.current = setTimeout(() => {
        doSearch(value);
      }, 300);
    } else {
      setResults([]);
      setTotal(0);
    }
  };

  const handleSearchSubmit = () => {
    if (query.length >= 2) {
      addRecentSearch(query);
      setRecentSearches(getRecentSearches());
      doSearch(query);
    }
  };

  const handleRecentClick = (q: string) => {
    setQuery(q);
    inputRef.current?.focus();
    doSearch(q);
  };

  const handleRemoveRecent = (e: React.MouseEvent, q: string) => {
    e.stopPropagation();
    const updated = recentSearches.filter(s => s !== q);
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch { /* ignore */ }
    setRecentSearches(updated);
  };

  const handleResultClick = (r: SearchResult) => {
    // Save to recent searches
    addRecentSearch(query);
    setRecentSearches(getRecentSearches());

    if (r.mime.startsWith('image/') || r.mime.startsWith('video/')) {
      onOpenFile(r.path, r.mime);
    } else {
      onNavigate(r.dir);
    }
    onClose();
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
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length > 0) {
        const r = results[selectedIndex];
        if (r) handleResultClick(r);
      } else if (query.length >= 2) {
        handleSearchSubmit();
      }
    }
  };

  const hasMore = total > results.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center sm:pt-[15vh] pt-[5vh] overscroll-contain" onClick={onClose} style={{ height: '100dvh' }}>
      <div
        className="w-full max-w-2xl mx-4 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden self-start mt-[5vh] sm:mt-0"
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
            <button onClick={() => { setQuery(''); setResults([]); setTotal(0); inputRef.current?.focus(); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <kbd className="hidden sm:inline-block text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">ESC</kbd>
        </div>

        {/* Results / Recent searches */}
        <div className="max-h-[50dvh] sm:max-h-[60vh] overflow-y-auto overscroll-contain">
          {/* Loading indicator */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
            </div>
          )}

          {/* Results */}
          {!loading && results.length > 0 && (
            <div className="py-2">
              <div className="px-4 py-1.5 text-xs text-gray-400 dark:text-gray-500 flex items-center justify-between">
                <span>找到 {total} 个结果</span>
                {hasMore && (
                  <span className="text-[10px] opacity-60">显示前 {results.length} 个</span>
                )}
              </div>
              {results.map((r, i) => (
                <button
                  key={r.path}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === selectedIndex
                      ? 'bg-blue-50 dark:bg-blue-900/30'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-750'
                  }`}
                  onClick={() => handleResultClick(r)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  {/* Thumbnail or icon */}
                  {r.mime.startsWith('image/') ? (
                    <img
                      src={getThumbUrl(r.path)}
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

              {/* Load more button */}
              {hasMore && (
                <div className="px-4 py-3">
                  {loadingMore ? (
                    <div className="flex items-center justify-center py-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
                    </div>
                  ) : (
                    <button
                      onClick={() => doSearch(query, results.length)}
                      className="w-full py-2 text-sm text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                    >
                      加载更多 ({total - results.length} 个结果未显示)
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* No results */}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="py-12 text-center text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm">未找到匹配「{query}」的文件</p>
              <button
                onClick={handleSearchSubmit}
                className="mt-3 text-xs text-blue-500 hover:text-blue-600 underline"
              >
                按 Enter 再次搜索
              </button>
            </div>
          )}

          {/* Recent searches (shown when no query) */}
          {query.length < 2 && recentSearches.length > 0 && (
            <div className="py-3">
              <div className="flex items-center justify-between px-4 py-1.5">
                <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  最近搜索
                </span>
                <button
                  onClick={() => { clearRecentSearches(); setRecentSearches([]); }}
                  className="text-[10px] text-red-400 hover:text-red-500"
                >
                  清除
                </button>
              </div>
              {recentSearches.map((q) => (
                <button
                  key={q}
                  onClick={() => handleRecentClick(q)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left"
                >
                  <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="flex-1 truncate">{q}</span>
                  <button
                    onClick={(e) => handleRemoveRecent(e, q)}
                    className="p-0.5 text-gray-300 hover:text-gray-500 rounded"
                    title="移除"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </button>
              ))}
            </div>
          )}

          {/* Empty state when no query and no history */}
          {query.length < 2 && recentSearches.length === 0 && (
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
