import React, { useEffect, useRef } from 'react';

interface CodeEditorProps {
  content: string;
  language: string;
  fileName: string;
  onSave: (content: string) => void;
  onClose: () => void;
  /** Embed inside a parent container instead of rendering as a full-screen modal */
  embedded?: boolean;
  /** Show saving spinner/disabled state */
  saving?: boolean;
}

export default function CodeEditor({ content, language, fileName, onSave, onClose, embedded = false, saving = false }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!saving) {
        onSave(textareaRef.current?.value || content);
      }
    }
    if (e.key === 'Escape') {
      onClose();
    }
    // Tab support
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }
    }
  };

  const handleSave = () => {
    if (!saving) {
      onSave(textareaRef.current?.value || content);
    }
  };

  const inner = (
    <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-5xl flex flex-col" style={{ height: embedded ? '100%' : '85vh' }}>
      <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-medium truncate">{fileName}</h3>
          <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded shrink-0">{language}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saving && (
            <svg className="w-3.5 h-3.5 text-green-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          <span className="text-xs text-gray-400">Ctrl+S 保存</span>
          {!embedded && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 ml-1">✕</button>
          )}
        </div>
      </div>
      <textarea
        ref={textareaRef}
        defaultValue={content}
        className="flex-1 p-4 resize-none font-mono text-sm dark:bg-gray-800 outline-none leading-relaxed min-h-0"
        spellCheck={false}
        onKeyDown={handleKeyDown}
      />
      <div className="flex justify-end gap-2 p-4 border-t dark:border-gray-700 shrink-0">
        {!embedded && (
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            取消
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
            saving
              ? 'bg-green-500/30 text-green-300 cursor-wait'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {saving && (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );

  if (embedded) {
    return inner;
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>
        {inner}
      </div>
    </div>
  );
}