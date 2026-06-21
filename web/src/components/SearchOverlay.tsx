import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { searchFiles, getFileUrl, getThumbUrl, type SearchResult } from '../api';
import { formatSize } from '../utils';
import FileTypeIcon from './FileTypeIcon';

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
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Client-side type filtering
  const filteredResults = useMemo(() => {
    if (!typeFilter) return results;
    return results.filter(r => {
      switch (typeFilter) {
        case 'image': return r.mime.startsWith('image/');
        case 'video': return r.mime.startsWith('video/');
        case 'audio': return r.mime.startsWith('audio/');
        case 'document': return r.mime.startsWith('application/') || r.mime.startsWith('text/');
        default: return true;
      }
    });
  }, [results, typeFilter]);

  // Per-type counts for the filter chips
  const typeCounts = useMemo(() => ({
    image: results.filter(r => r.mime.startsWith('image/')).length,
    video: results.filter(r => r.mime.startsWith('video/')).length,
    audio: results.filter(r => r.mime.startsWith('audio/')).length,
    document: results.filter(r => r.mime.startsWith('application/') || r.mime.startsWith('text/')).length,
  }), [results]);

  const filteredTotal = filteredResults.length;
  const hasMore = typeFilter ? false : total > results.length;

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [typeFilter]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Lock body scroll when search overlay is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Debounced search with stale request cancellation
  const doSearch = useCallback(async (q: string, appendOffset?: number) => {
    if (q.length < 2) {
      setResults([]);
      setTotal(0);
      return;
    }

    // Cancel any in-flight request to prevent stale results overwriting newer ones
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    if (appendOffset != null) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const limit = 30;
      const data = await searchFiles(q, limit, appendOffset || 0, signal);
      // After awaiting, skip if this request was already superseded
      if (signal.aborted) return;
      if (appendOffset != null) {
        setResults(prev => [...prev, ...(data.results || [])]);
      } else {
        setResults(data.results || []);
      }
      setTotal(data.total || 0);
      setSelectedIndex(0);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return; // cancelled by newer search — silent
      console.error('Search failed:', err);
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
      setSelectedIndex((i) => Math.min(i + 1, Math.max(filteredResults.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredResults.length > 0) {
        const r = filteredResults[selectedIndex];
        if (r) handleResultClick(r);
      } else if (query.length >= 2) {
        handleSearchSubmit();
      }
    }
  };

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
            type="search"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索所有文件..."
            enterKeyHint="search"
            autoComplete="off"
            className="flex-1 text-lg bg-transparent outline-none placeholder-gray-400 dark:placeholder-gray-500 [&::-webkit-search-decoration]:hidden [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-results-button]:hidden"
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); setTotal(0); inputRef.current?.focus(); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <kbd className="hidden sm:inline-block text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">ESC</kbd>
          <button
            onClick={onClose}
            className="sm:hidden p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="关闭"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Type filter chips — only show when there are results */}
        {results.length > 0 && (
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-100 dark:border-gray-700/50 overflow-x-auto scrollbar-hide">
            {[
              { key: null, label: '全部', icon: (active: boolean) => <svg className={`w-3.5 h-3.5 ${active ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> },
              { key: 'image', label: '图片', icon: (active: boolean) => <FileTypeIcon mime="image/jpeg" className={`w-4 h-4 ${active ? '' : 'opacity-60'}`} />, count: typeCounts.image },
              { key: 'video', label: '视频', icon: (active: boolean) => <FileTypeIcon mime="video/mp4" className={`w-4 h-4 ${active ? '' : 'opacity-60'}`} />, count: typeCounts.video },
              { key: 'audio', label: '音频', icon: (active: boolean) => <FileTypeIcon mime="audio/mp3" className={`w-4 h-4 ${active ? '' : 'opacity-60'}`} />, count: typeCounts.audio },
              { key: 'document', label: '文档', icon: (active: boolean) => <FileTypeIcon mime="application/pdf" className={`w-4 h-4 ${active ? '' : 'opacity-60'}`} />, count: typeCounts.document },
            ].filter(item => item.key === null || (item.count > 0)).map(item => (
              <button
                key={item.key ?? 'all'}
                onClick={() => setTypeFilter(item.key)}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-full whitespace-nowrap transition-colors shrink-0 ${
                  typeFilter === item.key
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-medium'
                    : 'bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600/50'
                }`}
              >
                {item.icon(typeFilter === item.key)}
                <span>{item.label}</span>
                {item.key !== null && (
                  <span className={`text-[10px] ml-0.5 ${typeFilter === item.key ? 'text-blue-400' : 'text-gray-400'}`}>
                    {item.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

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
                <span>
                  {typeFilter
                    ? `${filteredTotal} / ${total} 个结果`
                    : `找到 ${total} 个结果`}
                </span>
                {hasMore && (
                  <span className="text-[10px] opacity-60">显示前 {results.length} 个</span>
                )}
              </div>
              {filteredResults.map((r, i) => (
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
                    <span className="w-10 h-10 flex items-center justify-center shrink-0"><FileTypeIcon mime={r.mime} className="w-8 h-8" /></span>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      <HighlightText text={r.name} query={query} />
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                      {r.dir ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); addRecentSearch(query); setRecentSearches(getRecentSearches()); onNavigate(r.dir); onClose(); }}
                          className="inline-flex items-center gap-1 hover:text-blue-400 dark:hover:text-blue-400 transition-colors"
                          title="跳转到此文件夹"
                        >
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                          <span className="truncate">{r.dir}</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                          根目录
                        </span>
                      )}
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
