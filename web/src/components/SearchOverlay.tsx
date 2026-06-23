import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { searchFiles, getFileUrl, getThumbUrl, type SearchResult } from '../api';
import { formatSize } from '../utils';
import FileTypeIcon from './FileTypeIcon';
import SafeThumb from './SafeThumb';
import HighlightText from './HighlightText';

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
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Per-type counts for the filter chips
  const typeCounts = useMemo(() => ({
    image: results.filter(r => r.mime.startsWith('image/')).length,
    video: results.filter(r => r.mime.startsWith('video/')).length,
    audio: results.filter(r => r.mime.startsWith('audio/')).length,
    document: results.filter(r => r.mime.startsWith('application/') || r.mime.startsWith('text/')).length,
  }), [results]);

  const hasMore = total > results.length;

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [typeFilter]);

  // Focus input and select existing text on mount
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
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
  const doSearch = useCallback(async (q: string, appendOffset?: number, filterType?: string | null) => {
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
      const data = await searchFiles(q, limit, appendOffset || 0, signal, filterType || undefined);
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
        doSearch(value, undefined, typeFilter);
      }, 300);
    } else {
      setResults([]);
      setTotal(0);
    }
  };

  // Re-fetch with typeFilter when it changes
  useEffect(() => {
    if (query.length >= 2) {
      doSearch(query, undefined, typeFilter);
    }
  }, [typeFilter]);

  // IntersectionObserver-based infinite scroll for search results
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loadingMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore && !loadingMore) {
          doSearch(query, results.length, typeFilter);
        }
      },
      { root: null, rootMargin: '200px', threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, query, results.length, typeFilter, doSearch]);

  const handleSearchSubmit = () => {
    if (query.length >= 2) {
      addRecentSearch(query);
      setRecentSearches(getRecentSearches());
      doSearch(query, undefined, typeFilter);
    }
  };

  const handleRecentClick = (q: string) => {
    setQuery(q);
    inputRef.current?.focus();
    doSearch(q, undefined, typeFilter);
  };

  const handleRemoveRecent = (e: React.MouseEvent, q: string) => {
    e.stopPropagation();
    const updated = recentSearches.filter(s => s !== q);
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch { /* ignore */ }
    setRecentSearches(updated);
  };

  const handleResultClick = (r: SearchResult, e?: React.MouseEvent) => {
    // Ctrl+Click / Cmd+Click / Middle-click opens file in a new tab
    if (e?.ctrlKey || e?.metaKey || e?.button === 1) {
      e?.preventDefault();
      window.open(getFileUrl(r.path), '_blank');
      return;
    }

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

  // Auto-scroll selected result into view on keyboard navigation
  useEffect(() => {
    if (!resultsContainerRef.current || selectedIndex < 0) return;
    const el = resultsContainerRef.current.querySelector(`[data-result-index="${selectedIndex}"]`);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (results.length > 0) {
        const r = results[selectedIndex];
        if (r) {
          window.open(getFileUrl(r.path), '_blank');
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length > 0) {
        const r = results[selectedIndex];
        if (r) handleResultClick(r);
      } else if (query.length >= 2) {
        handleSearchSubmit();
      }
    } else if (e.altKey && (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4' || e.key === '0')) {
      e.preventDefault();
      const map: Record<string, string | null> = { '0': null, '1': 'image', '2': 'video', '3': 'audio', '4': 'document' };
      setTypeFilter(map[e.key]);
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
            placeholder="搜索所有文件... Esc 关闭 · ↑↓ 选择 · Alt+0~4 筛选"
            enterKeyHint="search"
            autoComplete="off"
            className="flex-1 text-lg bg-transparent outline-none placeholder-gray-400 dark:placeholder-gray-500 [&::-webkit-search-decoration]:hidden [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-results-button]:hidden"
          />
          {query && (
            <button onClick={() => { setQuery(''); setTypeFilter(null); setResults([]); setTotal(0); inputRef.current?.focus(); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
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
              { key: null as string | null, shortcut: '0', label: '全部', count: 0, icon: (active: boolean) => <svg className={`w-3.5 h-3.5 ${active ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> },
              { key: 'image', shortcut: '1', label: '图片', icon: (active: boolean) => <FileTypeIcon mime="image/jpeg" className={`w-4 h-4 ${active ? '' : 'opacity-60'}`} />, count: typeCounts.image },
              { key: 'video', shortcut: '2', label: '视频', icon: (active: boolean) => <FileTypeIcon mime="video/mp4" className={`w-4 h-4 ${active ? '' : 'opacity-60'}`} />, count: typeCounts.video },
              { key: 'audio', shortcut: '3', label: '音频', icon: (active: boolean) => <FileTypeIcon mime="audio/mp3" className={`w-4 h-4 ${active ? '' : 'opacity-60'}`} />, count: typeCounts.audio },
              { key: 'document', shortcut: '4', label: '文档', icon: (active: boolean) => <FileTypeIcon mime="application/pdf" className={`w-4 h-4 ${active ? '' : 'opacity-60'}`} />, count: typeCounts.document },
            ].filter(item => item.key === null || (item.count > 0)).map(item => (
              <button
                key={item.key ?? 'all'}
                onClick={() => setTypeFilter(prev => prev === item.key ? null : item.key)}
                title={`Alt+${item.shortcut} 切换`}
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
                <kbd className="text-[9px] text-gray-400 dark:text-gray-500 bg-gray-200/60 dark:bg-gray-600/60 px-1 rounded ml-0.5 hidden sm:inline">Alt+{item.shortcut}</kbd>
              </button>
            ))}
          </div>
        )}

        {/* Results / Recent searches */}
        <div ref={resultsContainerRef} className="max-h-[50dvh] sm:max-h-[60vh] overflow-y-auto overscroll-contain">
          {/* Loading indicator — subtle when stale results exist, full when starting fresh */}
          {loading && (
            results.length > 0 ? (
              <div className="flex items-center justify-center py-2 gap-2 border-b border-gray-100 dark:border-gray-700/50 mx-4">
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-blue-400 border-t-transparent" />
                <span className="text-xs text-gray-400">正在搜索...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
              </div>
            )
          )}

          {/* Results — always visible when available, even during loading */}
          {results.length > 0 && (
            <div className="py-2 animate-fade-in">
              <div className="px-4 py-1.5 text-xs text-gray-400 dark:text-gray-500 flex items-center justify-between">
                <span>
                  {typeFilter
                    ? `${results.length} / ${total} 个结果`
                    : `找到 ${total} 个结果`}
                </span>
                {hasMore && (
                  <span className="text-[10px] opacity-60">显示前 {results.length} 个</span>
                )}
              </div>
              {results.map((r, i) => (
                <button
                  key={r.path}
                  data-result-index={i}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === selectedIndex
                      ? 'bg-blue-50 dark:bg-blue-900/30'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                  onClick={(e) => handleResultClick(r, e)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  title="Ctrl+Click 在新标签页打开"
                >
                  {/* Thumbnail or icon */}
                  {r.mime.startsWith('image/') ? (
                    <div className="w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                      <SafeThumb path={r.path} containerSize="sm" />
                    </div>
                  ) : (
                    <span className="w-10 h-10 flex items-center justify-center shrink-0"><FileTypeIcon mime={r.mime} className="w-8 h-8" /></span>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      <HighlightText text={r.name} searchTerm={query} />
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

              {/* Infinite scroll sentinel + loading more spinner */}
              {hasMore && (
                <div ref={sentinelRef} className="px-4 py-3">
                  {loadingMore ? (
                    <div className="flex items-center justify-center py-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-2">
                      <div className="text-xs text-gray-400">滚动加载更多...</div>
                    </div>
                  )}
                </div>
              )}

              {/* All results loaded indicator */}
              {!hasMore && results.length >= 2 && total > 0 && (
                <div className="px-4 py-3 text-center">
                  <span className="text-[11px] text-gray-300 dark:text-gray-600">已显示全部 {total} 个结果</span>
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
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
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
          <span className="flex items-center gap-1 hidden sm:flex"><kbd className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">^↵</kbd> 新标签页</span>
          <span className="flex items-center gap-1 hidden sm:flex"><kbd className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">Alt+1–4</kbd> 筛选</span>
          <span className="flex items-center gap-1"><kbd className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  );
}
