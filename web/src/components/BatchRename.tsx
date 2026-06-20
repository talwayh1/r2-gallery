import { useState, useEffect, useMemo } from 'react';
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
  const [confirming, setConfirming] = useState(false);

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

  // Compute changes for preview
  const changes = useMemo(() => {
    return selectedFiles.map(path => {
      const originalName = path.split('/').pop() || path;
      const newName = names[path] || originalName;
      const changed = newName !== originalName;
      return { path, originalName, newName, changed };
    });
  }, [selectedFiles, names]);

  const changedCount = useMemo(() => changes.filter(c => c.changed).length, [changes]);

  const handlePreview = () => {
    if (changedCount === 0) {
      toast('warning', '没有文件需要重命名');
      return;
    }
    setConfirming(true);
  };

  const handleConfirm = async () => {
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

  const handleBack = () => {
    setConfirming(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">
            {confirming ? '确认重命名' : `批量重命名 (${selectedFiles.length} 个文件)`}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">✕</button>
        </div>

        {/* Edit mode: prefix/suffix + individual rename inputs */}
        {!confirming && (
          <>
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
                onClick={handlePreview}
                className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
              >
                预览更改
              </button>
            </div>
          </>
        )}

        {/* Confirm mode: diff preview */}
        {confirming && (
          <>
            {/* Summary bar */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/10">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  即将重命名 {changedCount} 个文件：
                </span>
                <span className="text-gray-500">
                  {selectedFiles.length - changedCount} 个保持不变
                </span>
              </div>
            </div>

            {/* Diff preview */}
            <div className="flex-1 overflow-auto p-4 space-y-2">
              {changes.map(({ path, originalName, newName, changed }) => (
                <div
                  key={path}
                  className={`flex items-start gap-3 p-2 rounded-lg ${
                    changed
                      ? 'bg-blue-50 dark:bg-blue-900/10'
                      : 'opacity-50'
                  }`}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400 text-xs font-mono">旧</span>
                      <span className={`font-mono text-sm truncate ${changed ? 'text-red-500 line-through' : 'text-gray-500'}`}>
                        {originalName}
                      </span>
                    </div>
                    {changed && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-emerald-500 text-xs font-mono">新</span>
                        <span className="font-mono text-sm text-emerald-600 dark:text-emerald-400 truncate">
                          {newName}
                        </span>
                      </div>
                    )}
                  </div>
                  {changed && <span className="shrink-0 text-xs text-blue-400 font-medium mt-1">已更改</span>}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={handleBack} className="px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                返回修改
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="px-6 py-2 text-sm bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg"
              >
                {loading ? '执行中...' : `确认执行 (${changedCount})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
