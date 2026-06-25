import { useState, useEffect, useCallback } from 'react';
import { listDirs, mkdir } from '../api';

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

// Max depth to pre-expand by default (root + one level)
const PRE_EXPAND_DEPTH = 1;

/** Recursively filter out currentDir and its descendants */
function filterTree(nodes: DirNode[], currentDir: string): DirNode[] {
  return nodes
    .filter((n) => n.path !== currentDir && !n.path.startsWith(currentDir + '/'))
    .map((n) => ({
      ...n,
      children: n.children ? filterTree(n.children, currentDir) : undefined,
    }));
}

/**
 * Collect all expandable paths from the tree up to a given depth.
 * Used to pre-expand the first level(s) for better UX.
 */
function collectPathsAtDepth(nodes: DirNode[], depth: number): Set<string> {
  const result = new Set<string>();
  function walk(list: DirNode[], d: number) {
    for (const n of list) {
      if (d <= depth && n.children && n.children.length > 0) {
        result.add(n.path);
      }
      if (d < depth && n.children) walk(n.children, d + 1);
    }
  }
  walk(nodes, 0);
  return result;
}

export default function MoveToFolder({ currentDir, onMove, onClose }: Props) {
  const [tree, setTree] = useState<DirNode[]>([]);
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingError, setCreatingError] = useState('');

  // Load + filter tree, pre-expand first level
  useEffect(() => {
    setLoading(true);
    listDirs()
      .then((raw: DirNode[]) => {
        const filtered = filterTree(raw, currentDir);
        setTree(filtered);
        setExpanded(collectPathsAtDepth(filtered, PRE_EXPAND_DEPTH));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [currentDir]);

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) {
      setCreatingError('请输入文件夹名称');
      return;
    }
    // Validate name — no slashes or special chars
    if (/[/\\:*?"<>|]/.test(name)) {
      setCreatingError('文件夹名称不能包含 / \\ : * ? " < > |');
      return;
    }
    setCreatingError('');
    const folderPath = currentDir ? `${currentDir}/${name}` : name;
    try {
      await mkdir(folderPath);
      // Reload directory tree
      const raw: DirNode[] = await listDirs();
      const filtered = filterTree(raw, currentDir);
      setTree(filtered);
      setExpanded(collectPathsAtDepth(filtered, PRE_EXPAND_DEPTH));
      setNewFolderName('');
      setCreating(false);
    } catch (e) {
      setCreatingError(`创建失败: ${(e as Error).message}`);
    }
  }, [newFolderName, currentDir]);

  const renderTree = (nodes: DirNode[], depth: number) => {
    return nodes.map((node) => {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expanded.has(node.path);
      const isSelected = target === node.path;

      return (
        <div key={node.path}>
          <div
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
              isSelected
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
            style={{ paddingLeft: `${depth * 20 + 8}px` }}
            onClick={() => setTarget(node.path)}
          >
            {/* Expand/collapse toggle */}
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node.path);
                }}
                className="p-0.5 hover:bg-white/10 rounded shrink-0 text-white/40 hover:text-white/70 transition-colors"
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}

            {/* Folder icon */}
            <svg className="w-4 h-4 shrink-0 text-yellow-500/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>

            {/* Name */}
            <span className="truncate flex-1">{node.name}</span>

            {/* Selected checkmark */}
            {isSelected && (
              <svg className="w-4 h-4 shrink-0 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>

          {/* Children (collapsible) */}
          {hasChildren && isExpanded && (
            <div className="overflow-hidden animate-fade-in">
              {renderTree(node.children!, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  // Current directory display name
  const displayCurrent = currentDir
    ? currentDir.split('/').filter(Boolean).join(' / ')
    : '根目录';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-white/10 rounded-xl p-5 w-full max-w-md mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-white font-medium text-lg">移动到文件夹</h3>
          <button onClick={onClose} className="p-1 text-white/50 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Current directory indicator */}
        <p className="text-xs text-white/40 mb-4">
          当前位置: <span className="text-white/60">{displayCurrent}</span>
        </p>

        {/* Tree or loading */}
        {loading ? (
          <div className="text-white/50 text-sm text-center py-8">加载目录列表...</div>
        ) : tree.length === 0 ? (
          <div className="text-white/50 text-sm text-center py-8">
            没有可用的目录
          </div>
        ) : (
          <>
            {/* Root option */}
            <div
              onClick={() => setTarget('')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer mb-0.5 ${
                target === ''
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <svg className="w-4 h-4 shrink-0 text-yellow-500/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span className="truncate flex-1">/ (根目录)</span>
              {target === '' && (
                <svg className="w-4 h-4 shrink-0 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>

            {/* Directory tree */}
            <div className="max-h-48 overflow-y-auto space-y-0.5 mb-3">
              {renderTree(tree, 0)}
            </div>
          </>
        )}

        {/* Create new folder section */}
        {!loading && (
          <div className="border-t border-white/10 pt-3 mb-3">
            {creating ? (
              <div className="space-y-2">
                <label className="text-xs text-white/50">新建文件夹</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => { setNewFolderName(e.target.value); setCreatingError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setCreating(false); }}
                    placeholder="输入文件夹名称..."
                    className="flex-1 px-3 py-1.5 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition-colors"
                    autoFocus
                  />
                  <button
                    onClick={handleCreateFolder}
                    className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shrink-0"
                  >
                    创建
                  </button>
                  <button
                    onClick={() => { setCreating(false); setNewFolderName(''); setCreatingError(''); }}
                    className="px-3 py-1.5 text-sm text-white/50 hover:text-white transition-colors shrink-0"
                  >
                    取消
                  </button>
                </div>
                {creatingError && (
                  <p className="text-xs text-red-400">{creatingError}</p>
                )}
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>新建文件夹</span>
              </button>
            )}
          </div>
        )}

        {/* Action buttons */}
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
