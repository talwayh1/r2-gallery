import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { listDirs } from '../api';

interface DirNode {
  name: string;
  path: string;
  children: DirNode[];
}

interface FlatItem {
  name: string;
  path: string;
  depth: number;
}

interface Props {
  title: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

/** Flatten tree into a navigable list with depth info */
function flattenTree(nodes: DirNode[], depth = 0): FlatItem[] {
  const result: FlatItem[] = [];
  for (const node of nodes) {
    result.push({ name: node.name, path: node.path, depth });
    if (node.children?.length > 0) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

export default function FolderPicker({ title, onSelect, onClose }: Props) {
  const [dirs, setDirs] = useState<DirNode[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [focusIndex, setFocusIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const rootButtonRef = useRef<HTMLButtonElement>(null);

  const flatItems = useMemo(() => {
    const items: FlatItem[] = [{ name: '根目录', path: '', depth: 0 }];
    items.push(...flattenTree(dirs));
    return items;
  }, [dirs]);

  useEffect(() => {
    listDirs().then((tree: DirNode[]) => {
      setDirs(tree);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Auto-scroll focused item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-folder-index="${focusIndex}"]`);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  }, [focusIndex]);

  // Reset focus index when items change
  useEffect(() => {
    setFocusIndex(0);
  }, [flatItems.length]);

  const handleConfirm = useCallback(() => {
    onSelect(selected);
  }, [onSelect, selected]);

  // Keyboard navigation with event delegation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusIndex(i => Math.min(i + 1, flatItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusIndex(i => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (flatItems[focusIndex]) {
            setSelected(flatItems[focusIndex].path);
            // Confirm on second Enter, or just select on first
            if (selected === flatItems[focusIndex].path) {
              onSelect(flatItems[focusIndex].path);
            }
          }
          break;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, flatItems, focusIndex, selected, onSelect]);

  // Sync selected path when focus moves
  useEffect(() => {
    if (flatItems[focusIndex]) {
      setSelected(flatItems[focusIndex].path);
    }
  }, [focusIndex, flatItems]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h3 className="font-medium">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
            </div>
          ) : (
            <div>
              {/* Root option */}
              <button
                ref={rootButtonRef}
                data-folder-index={0}
                onClick={() => setSelected('')}
                onDoubleClick={() => onSelect('')}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors ${
                  selected === '' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : ''
                } ${focusIndex === 0 ? 'ring-2 ring-inset ring-blue-500/50' : ''}`}
              >
                <span className="text-base leading-none">🏠</span>
                <span className="truncate">根目录</span>
                {selected === '' && <span className="ml-auto text-xs">✓</span>}
              </button>
              {flatItems.slice(1).map((item, i) => (
                <button
                  key={item.path}
                  data-folder-index={i + 1}
                  onClick={() => setSelected(item.path)}
                  onDoubleClick={() => onSelect(item.path)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors ${
                    selected === item.path ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : ''
                  } ${focusIndex === i + 1 ? 'ring-2 ring-inset ring-blue-500/50' : ''}`}
                  style={{ paddingLeft: `${item.depth * 16 + 12}px` }}
                >
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                  <span className="truncate">{item.name}</span>
                  {selected === item.path && <span className="ml-auto text-xs">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            disabled={flatItems.length === 0}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
