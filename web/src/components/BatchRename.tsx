import { useState, useEffect } from 'react';
import { batchRename as batchRenameApi } from '../api';
import { toast } from '../hooks/useToast';

interface Props {
  selectedFiles: string[];
  onDone: () => void;
  onClose: () => void;
}

export default function BatchRename({ selectedFiles, onDone, onClose }: Props) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [loading, setLoading] = useState(false);

  // Initialize names from selected files
  useEffect(() => {
    const init: Record<string, string> = {};
    selectedFiles.forEach(path => {
      const name = path.split('/').pop() || path;
      init[path] = name;
    });
    setNames(init);
  }, [selectedFiles]);

  // Apply prefix/suffix to all names
  const applyPattern = () => {
    const updated: Record<string, string> = {};
    selectedFiles.forEach(path => {
      const name = path.split('/').pop() || path;
      const ext = name.includes('.') ? '.' + name.split('.').pop() : '';
      const baseName = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
      updated[path] = `${prefix}${baseName}${suffix}${ext}`;
    });
    setNames(updated);
  };

  const handleRename = async () => {
    const items = selectedFiles.map(path => ({
      oldPath: path,
      newName: names[path] || path.split('/').pop() || '',
    })).filter(item => item.newName);

    if (items.length === 0) return;

    setLoading(true);
    try {
      const result = await batchRenameApi(items);
      toast('success', `批量重命名完成：成功 ${result.success} 个，失败 ${result.failed} 个`);
      onDone();
    } catch (e) {
      toast('error', `批量重命名失败: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">批量重命名 ({selectedFiles.length} 个文件)</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">✕</button>
        </div>

        {/* Prefix/Suffix pattern */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-850">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">前缀</label>
              <input
                type="text"
                value={prefix}
                onChange={e => setPrefix(e.target.value)}
                placeholder="添加前缀..."
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">后缀</label>
              <input
                type="text"
                value={suffix}
                onChange={e => setSuffix(e.target.value)}
                placeholder="添加后缀..."
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
            </div>
            <button
              onClick={applyPattern}
              className="self-end px-4 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
            >
              应用
            </button>
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-auto p-4 space-y-2">
          {selectedFiles.map(path => {
            const originalName = path.split('/').pop() || path;
            const currentName = names[path] || originalName;
            const changed = currentName !== originalName;

            return (
              <div key={path} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-24 truncate" title={path}>{originalName}</span>
                <span className="text-gray-400">→</span>
                <input
                  type="text"
                  value={currentName}
                  onChange={e => setNames(prev => ({ ...prev, [path]: e.target.value }))}
                  className={`flex-1 px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-700 ${
                    changed
                      ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                />
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            取消
          </button>
          <button
            onClick={handleRename}
            disabled={loading}
            className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg"
          >
            {loading ? '重命名中...' : '确认重命名'}
          </button>
        </div>
      </div>
    </div>
  );
}
