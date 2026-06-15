import { useState, useEffect } from 'react';
import { listDirs } from '../api';

interface Props {
  currentDir: string;
  onNavigate: (path: string) => void;
}

interface DirNode {
  name: string;
  path: string;
  children?: DirNode[];
}

export default function Sidebar({ currentDir, onNavigate }: Props) {
  const [tree, setTree] = useState<DirNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    listDirs().then(setTree).catch(console.error);
  }, []);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderNode = (node: DirNode, depth: number = 0) => {
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

  return (
    <aside className="w-60 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto shrink-0">
      <div className="p-3">
        <button
          onClick={() => onNavigate('')}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
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
      </div>
      <div className="px-2 pb-3 space-y-0.5">
        {tree.map((node) => renderNode(node))}
      </div>
    </aside>
  );
}
