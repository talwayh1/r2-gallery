import { useState, useEffect, useCallback } from 'react';
import { listDirs } from '../api';

interface Props {
  currentDir: string;
  onNavigate: (path: string) => void;
  onClose?: () => void;
}

interface DirNode {
  name: string;
  path: string;
  children?: DirNode[];
}

type SortMode = 'name_asc' | 'name_desc' | 'date_asc' | 'date_desc';

const STORAGE_KEY_EXPANDED = 'sidebar_expanded';
const STORAGE_KEY_SORT = 'sidebar_sort';
const MAX_DEPTH = 5;

function loadExpanded(): Set<string> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_EXPANDED);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  } catch {
    return new Set();
  }
}

function saveExpanded(expanded: Set<string>) {
  localStorage.setItem(STORAGE_KEY_EXPANDED, JSON.stringify([...expanded]));
}

function sortNodes(nodes: DirNode[], sort: SortMode): DirNode[] {
  return [...nodes].sort((a, b) => {
    const cmp = a.name.localeCompare(b.name, 'zh-CN');
    if (sort === 'name_asc') return cmp;
    if (sort === 'name_desc') return -cmp;
    return 0;
  }).map(n => ({
    ...n,
    children: n.children ? sortNodes(n.children, sort) : undefined,
  }));
}

// Cache directory tree across sidebar mount/unmount cycles
let dirTreeCache: DirNode[] | null = null;
let dirTreeCacheTime = 0;
const DIR_TREE_CACHE_TTL = 30_000; // 30 seconds

export default function Sidebar({ currentDir, onNavigate, onClose }: Props) {
  const [tree, setTree] = useState<DirNode[]>(dirTreeCache || []);
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  const [sort, setSort] = useState<SortMode>(
    () => (localStorage.getItem(STORAGE_KEY_SORT) as SortMode) || 'name_asc'
  );
  const [maxDepth] = useState(MAX_DEPTH);

  useEffect(() => {
    // Use cache if fresh
    if (dirTreeCache && Date.now() - dirTreeCacheTime < DIR_TREE_CACHE_TTL) {
      setTree(dirTreeCache);
      return;
    }
    listDirs().then((data) => {
      dirTreeCache = data;
      dirTreeCacheTime = Date.now();
      setTree(data);
    }).catch(console.error);
  }, []);

  // Auto-expand ancestor paths when navigating to a directory
  useEffect(() => {
    if (!currentDir) return;
    const parts = currentDir.split('/');
    const ancestors: string[] = [];
    for (let i = 1; i <= parts.length; i++) {
      ancestors.push(parts.slice(0, i).join('/'));
    }
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const path of ancestors) {
        if (!next.has(path)) {
          next.add(path);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [currentDir]);

  useEffect(() => {
    saveExpanded(expanded);
  }, [expanded]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SORT, sort);
  }, [sort]);

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const renderNode = (node: DirNode, depth: number = 0) => {
    if (depth >= maxDepth) return null;
    
    const isOpen = expanded.has(node.path);
    const isActive = currentDir === node.path;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.path}>
        <button
          onClick={() => onNavigate(node.path)}
          className={`w-full flex items-center gap-1 px-2 py-1.5 text-sm rounded-lg transition-colors ${
            isActive
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {hasChildren && (
            <span onClick={(e) => { e.stopPropagation(); toggle(node.path); }} className="w-4">
              <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" />
              </svg>
            </span>
          )}
          <svg className="w-4 h-4 text-yellow-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen && hasChildren && node.children!.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  const sortedTree = sortNodes(tree, sort);

  return (
    <aside className="w-60 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto shrink-0">
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => onNavigate('')}
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
              !currentDir
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Home
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg shrink-0"
              title="关闭侧边栏"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="w-full text-xs px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600 mb-2"
        >
          <option value="name_asc">名称 A→Z</option>
          <option value="name_desc">名称 Z→A</option>
        </select>
      </div>
      <div className="px-2 pb-3 space-y-0.5">
        {sortedTree.map((node) => renderNode(node))}
      </div>
    </aside>
  );
}
