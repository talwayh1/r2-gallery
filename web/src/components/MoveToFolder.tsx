import { useState, useEffect } from 'react';
import { listDirs } from '../api';

interface Props {
  currentDir: string;
  onMove: (targetDir: string) => void;
  onClose: () => void;
}

interface DirNode {
  name: string;
  path: string;
  children?: DirNode[];
}

function flattenTree(nodes: DirNode[], prefix = ''): { name: string; path: string }[] {
  const result: { name: string; path: string }[] = [];
  for (const n of nodes) {
    const fullPath = prefix ? `${prefix}/${n.name}` : n.name;
    result.push({ name: fullPath, path: fullPath });
    if (n.children) {
      result.push(...flattenTree(n.children, fullPath));
    }
  }
  return result;
}

export default function MoveToFolder({ currentDir, onMove, onClose }: Props) {
  const [dirs, setDirs] = useState<{ name: string; path: string }[]>([]);
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listDirs()
      .then((tree: DirNode[]) => {
        const flat = flattenTree(tree);
        // Filter out currentDir and its sub-items, and root
        const filtered = flat.filter(
          (d) => d.path !== currentDir && !d.path.startsWith(currentDir + '/')
        );
        // Prepend root "根目录"
        setDirs([{ name: '/ (根目录)', path: '' }, ...filtered]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [currentDir]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-white/10 rounded-xl p-5 w-full max-w-md mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium text-lg">移动到文件夹</h3>
          <button onClick={onClose} className="p-1 text-white/50 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="text-white/50 text-sm text-center py-6">加载目录列表...</div>
        ) : dirs.length === 0 ? (
          <div className="text-white/50 text-sm text-center py-6">没有可用的目录</div>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-1 mb-4">
            {dirs.map((d) => (
              <button
                key={d.path}
                onClick={() => setTarget(d.path)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                  target === d.path
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    : 'text-white/70 hover:bg-white/5 hover:text-white border border-transparent'
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="truncate">{d.name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => target !== '' && onMove(target)}
            disabled={!target || loading}
            className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            移动到此处
          </button>
        </div>
      </div>
    </div>
  );
}
