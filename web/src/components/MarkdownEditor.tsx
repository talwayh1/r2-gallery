import { useState, useRef, useEffect, useCallback } from 'react';

interface Props {
  content: string;
  fileName: string;
  onSave?: (content: string) => void;
  onClose?: () => void;
  readOnly?: boolean;
  saving?: boolean;
}

type ViewMode = 'edit' | 'preview' | 'split';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMarkdown(text: string): string {
  let html = text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-gray-800 text-green-400 p-4 rounded-lg overflow-x-auto text-sm font-mono my-3"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-700 text-pink-400 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold text-white mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-white mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-white mt-6 mb-3">$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-gray-300">$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-blue-400 hover:underline">$1</a>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full rounded-lg my-2" />')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-blue-500 pl-4 text-gray-400 italic my-2">$1</blockquote>')
    .replace(/^---$/gm, '<hr class="gray-700 my-4" />')
    .replace(/^[\-\*] (.+)$/gm, '<li class="ml-4 text-gray-300 list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 text-gray-300 list-decimal">$1</li>')
    .replace(/\n\n/g, '</p><p class="text-gray-300 leading-relaxed mb-2">')
    .replace(/\n/g, '<br />');

  return `<div class="prose prose-invert max-w-none">${html}</div>`;
}

function highlightCode(code: string, fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  let highlighted = code
    .replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, '<span class="text-green-400">$&</span>')
    .replace(/(\/\/.*$)/gm, '<span class="text-gray-500 italic">$1</span>')
    .replace(/(#.*$)/gm, '<span class="text-gray-500 italic">$1</span>')
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="text-gray-500 italic">$1</span>')
    .replace(/\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|import|export|from|default|new|this|super|async|await|try|catch|throw|finally|typeof|instanceof|in|of|void|delete|null|undefined|true|false)\b/g, '<span class="text-purple-400 font-bold">$1</span>')
    .replace(/\b(def|self|None|True|False|and|or|not|is|lambda|with|as|yield|raise|pass|global|nonlocal|assert|del)\b/g, '<span class="text-purple-400 font-bold">$1</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="text-orange-400">$1</span>');

  return highlighted;
}

/**
 * Take syntax-highlighted HTML and overlay search match highlighting.
 * We split on HTML tags so we only highlight in text nodes, not inside tag attributes.
 */
function applySearchToHtml(html: string, searchQuery: string, currentMatchIndex: number): string {
  if (!searchQuery.trim()) return html;
  const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = html.split(/(<[^>]*>)/g);
  let globalMatchCounter = 0;

  return parts.map((part) => {
    if (part.startsWith('<')) return part; // Skip HTML tags
    return part.replace(
      new RegExp(`(${escaped})`, 'gi'),
      (match) => {
        const isCurrent = globalMatchCounter === currentMatchIndex;
        globalMatchCounter++;
        return isCurrent
          ? `<mark class="bg-yellow-400/60 text-gray-900 rounded-sm font-normal">${match}</mark>`
          : `<mark class="bg-yellow-500/30 text-white rounded-sm font-normal">${match}</mark>`;
      }
    );
  }).join('');
}

/** Compute total match count without modifying HTML — used to update match count reactively */
function countSearchMatches(html: string, searchQuery: string): number {
  if (!searchQuery.trim()) return 0;
  const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = html.split(/(<[^>]*>)/g);
  let count = 0;
  for (const part of parts) {
    if (part.startsWith('<')) continue;
    const matches = part.match(new RegExp(escaped, 'gi'));
    if (matches) count += matches.length;
  }
  return count;
}

/** Find all match positions in the text for a search query */
function findMatches(text: string, query: string): { start: number; end: number }[] {
  if (!query.trim()) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');
  const results: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    results.push({ start: m.index, end: m.index + m[0].length });
  }
  return results;
}

/** Scroll the preview/code container to bring the current match into view */
function scrollToMatch(container: HTMLElement | null, matchIndex: number) {
  if (!container) return;
  const marks = container.querySelectorAll('mark');
  if (marks[matchIndex]) {
    marks[matchIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

export default function MarkdownEditor({ content, fileName, onSave, onClose, readOnly = false, saving = false }: Props) {
  const [mode, setMode] = useState<ViewMode>('split');
  const [editContent, setEditContent] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const codeViewRef = useRef<HTMLDivElement>(null);
  const isMarkdown = /\.(md|markdown|mdown|mkdn|mkd|mdwn|mkdown|ron)$/i.test(fileName);

  /* ---- Search state ---- */
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditContent(content);
  }, [content]);

  const handleScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const preview = previewRef.current;
    if (!textarea || !preview || mode !== 'split') return;
    const ratio = textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight);
    preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight);
  }, [mode]);

  const handleSave = () => {
    onSave?.(editContent);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  /* ---- Search keyboard handler ---- */
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowSearch(false);
      setSearchQuery('');
      setSearchMatchIndex(0);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        // Go to previous match
        setSearchMatchIndex((prev) => {
          const count = countSearchMatches(highlightCode(editContent, fileName), searchQuery);
          return prev <= 0 ? Math.max(0, count - 1) : prev - 1;
        });
      } else {
        // Go to next match
        setSearchMatchIndex((prev) => {
          const count = countSearchMatches(highlightCode(editContent, fileName), searchQuery);
          return prev >= count - 1 ? 0 : prev + 1;
        });
      }
    }
  }, [editContent, fileName, searchQuery]);

  /* ---- Focus search input when opened ---- */
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  /* ---- Scroll to current match after it changes ---- */
  useEffect(() => {
    if (showSearch && searchQuery.trim()) {
      scrollToMatch(codeViewRef.current, searchMatchIndex);
    }
  }, [searchMatchIndex, showSearch, searchQuery]);

  /* ---- Global Ctrl+F handler ---- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch((prev) => {
          if (!prev) {
            // Opening — try to use selected text as initial query
            const sel = window.getSelection()?.toString().trim();
            if (sel) {
              // Schedule setSearchQuery after state toggle
              setTimeout(() => setSearchQuery(sel), 0);
            }
          }
          return !prev;
        });
        setSearchMatchIndex(0);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* ---- Recalculate match index when query changes ---- */
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setSearchMatchIndex(0);
  };

  const synHighlighted = highlightCode(editContent, fileName);
  const matchCount = showSearch && searchQuery.trim()
    ? countSearchMatches(synHighlighted, searchQuery)
    : 0;

  if (isMarkdown) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10 bg-white/5">
          {(['edit', 'preview', 'split'] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                mode === m ? 'bg-blue-500/20 text-blue-400' : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              {m === 'edit' ? '编辑' : m === 'preview' ? '预览' : '分割'}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => { setShowSearch(s => !s); setSearchMatchIndex(0); }}
            className={`px-2 py-1 text-xs rounded transition-colors ${showSearch ? 'bg-blue-500/20 text-blue-400' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
            title="搜索 (Ctrl+F)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          {!readOnly && onSave && (
            <button onClick={handleSave} disabled={saving} className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${
              saving ? 'bg-green-500/30 text-green-300 cursor-wait' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
            }`}>
              {saving && <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
              {saving ? '保存中...' : '保存'}
            </button>
          )}
        </div>
        {/* Search bar for markdown preview */}
        {showSearch && !readOnly && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/10 bg-white/5">
            <svg className="w-3.5 h-3.5 text-white/40 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="搜索..."
              className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/30"
            />
            {searchQuery.trim() && (
              <span className="text-xs text-white/40 whitespace-nowrap">
                {matchCount > 0 ? `${searchMatchIndex + 1}/${matchCount}` : '无匹配'}
              </span>
            )}
            <button
              onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchMatchIndex(0); }}
              className="p-1 text-white/30 hover:text-white/70 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 flex overflow-hidden">
          {(mode === 'edit' || mode === 'split') && (
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onScroll={handleScroll}
              readOnly={readOnly}
              onKeyDown={handleKeyDown}
              className={`flex-1 bg-transparent text-gray-200 font-mono text-sm p-4 resize-none outline-none leading-relaxed ${mode === 'split' ? 'border-r border-white/10' : ''}`}
              placeholder="输入 Markdown 内容..."
              spellCheck={false}
            />
          )}
          {(mode === 'preview' || mode === 'split') && (
            <div
              ref={previewRef}
              className={`flex-1 overflow-auto p-4 text-sm ${mode === 'split' ? 'bg-gray-900/50' : ''}`}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(editContent) }}
            />
          )}
        </div>
      </div>
    );
  }

  const isEditable = !readOnly && !!onSave;
  const [codeViewMode, setCodeViewMode] = useState<'edit' | 'view'>('view');

  /* Compute search-highlighted HTML for code view */
  const searchHighlightedHtml = showSearch && searchQuery.trim()
    ? applySearchToHtml(synHighlighted, searchQuery, searchMatchIndex)
    : synHighlighted;

  /* For textarea (edit mode), compute match positions for scrolling */
  const searchMatchPositions = showSearch && searchQuery.trim()
    ? findMatches(editContent, searchQuery)
    : [];

  const handleSearchInEdit = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowSearch(false);
      setSearchQuery('');
      setSearchMatchIndex(0);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        setSearchMatchIndex((prev) => {
          return prev <= 0 ? Math.max(0, matchCount - 1) : prev - 1;
        });
      } else {
        setSearchMatchIndex((prev) => {
          return prev >= matchCount - 1 ? 0 : prev + 1;
        });
      }
    }
  }, [matchCount]);

  return (
    <div className="flex flex-col h-full" onKeyDown={(e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        setSearchMatchIndex(0);
      }
    }}>
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-white/5">
        <span className="text-white/40 text-xs font-mono">{fileName}</span>
        <div className="flex-1" />
        <button
          onClick={() => { setShowSearch(s => !s); setSearchMatchIndex(0); }}
          className={`px-2 py-1 text-xs rounded transition-colors ${showSearch ? 'bg-blue-500/20 text-blue-400' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
          title="搜索 (Ctrl+F)"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
        {isEditable && (
          <button
            onClick={() => setCodeViewMode(codeViewMode === 'edit' ? 'view' : 'edit')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              codeViewMode === 'edit'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-white/50 hover:text-white hover:bg-white/10'
            }`}
          >
            {codeViewMode === 'edit' ? '只读' : '编辑'}
          </button>
        )}
        <button
          onClick={() => { navigator.clipboard.writeText(editContent); }}
          className="px-2 py-1 text-xs text-white/50 hover:text-white hover:bg-white/10 rounded transition-colors"
        >
          复制
        </button>
        {isEditable && codeViewMode === 'edit' && (
          <button onClick={handleSave} disabled={saving} className={`px-2 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${
            saving ? 'bg-green-500/30 text-green-300 cursor-wait' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
          }`}>
            {saving && <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
            {saving ? '保存中...' : '保存'}
          </button>
        )}
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/10 bg-white/5">
          <svg className="w-3.5 h-3.5 text-white/40 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={codeViewMode === 'edit' ? handleSearchInEdit : handleSearchKeyDown}
            placeholder="搜索..."
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/30"
          />
          {searchQuery.trim() && (
            <span className="text-xs text-white/40 whitespace-nowrap">
              {matchCount > 0 ? `${searchMatchIndex + 1}/${matchCount}` : '无匹配'}
            </span>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setSearchMatchIndex((prev) => (prev <= 0 ? Math.max(0, matchCount - 1) : prev - 1));
              }}
              disabled={matchCount === 0}
              className="p-1 text-white/30 hover:text-white/70 disabled:opacity-20 transition-colors"
              title="上一个 (Shift+Enter)"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              onClick={() => {
                setSearchMatchIndex((prev) => (prev >= matchCount - 1 ? 0 : prev + 1));
              }}
              disabled={matchCount === 0}
              className="p-1 text-white/30 hover:text-white/70 disabled:opacity-20 transition-colors"
              title="下一个 (Enter)"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          <button
            onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchMatchIndex(0); }}
            className="p-1 text-white/30 hover:text-white/70 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Content area */}
      {isEditable && codeViewMode === 'edit' ? (
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-gray-900/30 text-gray-200 font-mono text-sm p-4 resize-none outline-none leading-relaxed"
          spellCheck={false}
        />
      ) : (
        <div ref={codeViewRef} className="flex-1 overflow-auto p-4">
          <pre className="text-sm font-mono leading-relaxed">
            <code
              className="text-gray-300"
              dangerouslySetInnerHTML={{ __html: searchHighlightedHtml }}
            />
          </pre>
        </div>
      )}
    </div>
  );
}
