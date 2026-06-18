import { useState, useEffect } from 'react';
import { listDirs } from '../api';

interface Props {
  title: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export default function FolderPicker({ title, onSelect, onClose }: Props) {
  const [dirs, setDirs] = useState<{ name: string; path: string; children: any[] }[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listDirs().then((tree) => {
      setDirs(tree);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const renderTree = (nodes: any[], depth = 0) => {
    return nodes.map((node: any) => (
      <div key={node.path}>
        <button
          onClick={() => setSelected(node.path)}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors ${
            selected === node.path ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : ''
          }`}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
        >
          <span>📁</span>
          <span className="truncate">{node.name}</span>
          {selected === node.path && <span className="ml-auto text-xs">✓</span>}
        </button>
        {node.children && node.children.length > 0 && renderTree(node.children, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h3 className="font-medium">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {/* Root option */}
          <button
            onClick={() => setSelected('')}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors ${
              selected === '' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : ''
            }`}
          >
            <span>🏠</span>
            <span>根目录</span>
            {selected === '' && <span className="ml-auto text-xs">✓</span>}
          </button>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
            </div>
          ) : (
            renderTree(dirs)
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            取消
          </button>
          <button
            onClick={() => onSelect(selected)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
