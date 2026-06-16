import { useState, useRef, useEffect, useCallback } from 'react';

interface Props {
  content: string;
  fileName: string;
  onSave?: (content: string) => void;
  onClose?: () => void;
  readOnly?: boolean;
}

type ViewMode = 'edit' | 'preview' | 'split';

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
    .replace(/^---$/gm, '<hr class="border-gray-700 my-4" />')
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

export default function MarkdownEditor({ content, fileName, onSave, readOnly = false }: Props) {
  const [mode, setMode] = useState<ViewMode>('split');
  const [editContent, setEditContent] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const isMarkdown = /\.(md|markdown|mdown|mkdn|mkd|mdwn|mkdown|ron)$/i.test(fileName);

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
          {!readOnly && onSave && (
            <button onClick={handleSave} className="px-3 py-1 text-xs bg-green-500/20 text-green-400 rounded-md hover:bg-green-500/30 transition-colors">
              保存
            </button>
          )}
        </div>
        <div className="flex-1 flex overflow-hidden">
          {(mode === 'edit' || mode === 'split') && (
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onScroll={handleScroll}
              readOnly={readOnly}
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-white/5">
        <span className="text-white/40 text-xs font-mono">{fileName}</span>
        <div className="flex-1" />
        <button
          onClick={() => { navigator.clipboard.writeText(editContent); }}
          className="px-2 py-1 text-xs text-white/50 hover:text-white hover:bg-white/10 rounded transition-colors"
        >
          复制
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <pre className="text-sm font-mono leading-relaxed">
          <code
            className="text-gray-300"
            dangerouslySetInnerHTML={{ __html: highlightCode(editContent, fileName) }}
          />
        </pre>
      </div>
    </div>
  );
}
