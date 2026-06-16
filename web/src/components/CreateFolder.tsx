import { useState, useRef, useEffect } from 'react';

type CreateMode = 'folder' | 'file' | 'url';

interface Props {
  currentDir: string;
  onConfirm: (name: string) => void;
  onCreateFile?: (path: string) => void;
  onCreateUrl?: (path: string, url: string) => void;
  onClose: () => void;
}

export default function CreateFolder({ currentDir, onConfirm, onCreateFile, onCreateUrl, onClose }: Props) {
  const [mode, setMode] = useState<CreateMode>('folder');
  const [name, setName] = useState('');
  const [urlValue, setUrlValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const fullPath = currentDir ? `${currentDir}/${trimmed}` : trimmed;
    if (mode === 'folder') onConfirm(trimmed);
    else if (mode === 'file' && onCreateFile) onCreateFile(fullPath);
    else if (mode === 'url' && onCreateUrl) onCreateUrl(fullPath, urlValue.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        {/* Mode tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {([
            { key: 'folder' as const, label: '文件夹', icon: '📁' },
            { key: 'file' as const, label: '文件', icon: '📄' },
            { key: 'url' as const, label: '链接', icon: '🔗' },
          ]).map((m) => (
            <button key={m.key} onClick={() => setMode(m.key)}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded-md transition-colors ${
                mode === m.key ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <span>{m.icon}</span><span>{m.label}</span>
            </button>
          ))}
        </div>

        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          {mode === 'folder' ? '新建文件夹' : mode === 'file' ? '新建文件' : '创建链接'}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          在 {currentDir ? `/${currentDir}` : '根目录'} 下创建
        </p>

        <form onSubmit={handleSubmit}>
          <input ref={inputRef} type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder={mode === 'folder' ? '文件夹名称' : mode === 'file' ? '文件名 (如 notes.txt)' : '链接名称'}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm mb-2" />
          {mode === 'url' && (
            <input type="url" value={urlValue} onChange={(e) => setUrlValue(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">取消</button>
            <button type="submit" disabled={!name.trim() || (mode === 'url' && !urlValue.trim())}
              className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors">创建</button>
          </div>
        </form>
      </div>
    </div>
  );
}
