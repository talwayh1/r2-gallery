import React, { useEffect, useRef } from 'react';

interface CodeEditorProps {
  content: string;
  language: string;
  fileName: string;
  onSave: (content: string) => void;
  onClose: () => void;
}

export default function CodeEditor({ content, language, fileName, onSave, onClose }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSave(textareaRef.current?.value || content);
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

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-5xl h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{fileName}</h3>
            <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">{language}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Ctrl+S 保存</span>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
          </div>
        </div>
        <textarea
          ref={textareaRef}
          defaultValue={content}
          className="flex-1 p-4 resize-none font-mono text-sm dark:bg-gray-800 outline-none leading-relaxed"
          spellCheck={false}
          onKeyDown={handleKeyDown}
        />
        <div className="flex justify-end gap-2 p-4 border-t dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            取消
          </button>
          <button onClick={() => onSave(textareaRef.current?.value || content)} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
