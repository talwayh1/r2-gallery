import { useState } from 'react';
import type { FileItem } from '../types';

interface Props {
  files: Record<string, FileItem>;
  dirs: string[];
  currentDir: string;
  onNavigate: (path: string) => void;
  onOpen: (path: string, mime: string) => void;
  onDelete?: (paths: string[]) => void;
  onRename?: (path: string, name: string) => void;
}

function formatSize(bytes: number) {
  if (bytes === 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(ts: number) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleDateString();
}

function getIcon(mime: string) {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime === 'application/pdf') return '📄';
  if (mime.startsWith('text/')) return '📝';
  return '📎';
}

export default function FileList({ files, dirs, currentDir, onNavigate, onOpen, onDelete, onRename }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<'name' | 'size' | 'date'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const allItems = [
    ...dirs.map((name) => ({
      name,
      type: 'directory' as const,
      size: 0,
      mime: 'directory',
      mtime: 0,
      path: currentDir ? `${currentDir}/${name}` : name,
    })),
    ...Object.values(files),
  ];

  const sorted = [...allItems].sort((a, b) => {
    // Directories first
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    let cmp = 0;
    if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortKey === 'size') cmp = a.size - b.size;
    else cmp = a.mtime - b.mtime;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (key: 'name' | 'size' | 'date') => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ active, dir }: { active: boolean; dir: string }) => (
    <svg className={`w-3 h-3 ml-1 inline ${active ? 'text-blue-500' : 'text-gray-400'}`} fill="currentColor" viewBox="0 0 20 20">
      <path d={dir === 'asc' ? 'M5 10l5-5 5 5' : 'M5 10l5 5 5-5'} />
    </svg>
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700">
            <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 cursor-pointer" onClick={() => toggleSort('name')}>
              Name <SortIcon active={sortKey === 'name'} dir={sortDir} />
            </th>
            <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400 w-24 cursor-pointer" onClick={() => toggleSort('size')}>
              Size <SortIcon active={sortKey === 'size'} dir={sortDir} />
            </th>
            <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400 w-32 cursor-pointer" onClick={() => toggleSort('date')}>
              Modified <SortIcon active={sortKey === 'date'} dir={sortDir} />
            </th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => {
            const isDir = item.type === 'directory';
            const isImage = item.mime.startsWith('image/');
            const isVideo = item.mime.startsWith('video/');
            return (
              <tr
                key={item.path}
                className={`border-b border-gray-100 dark:border-gray-700 cursor-pointer transition-colors ${
                  selected.has(item.path)
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-750'
                }`}
                onClick={() => {
                  if (isDir) onNavigate(item.path);
                  else if (isImage || isVideo) onOpen(item.path, item.mime);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (confirm(`Delete "${item.name}"?`)) onDelete?.([item.path]);
                }}
              >
                <td className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-lg">{isDir ? '📁' : getIcon(item.mime)}</span>
                  <span className="truncate">{item.name}</span>
                </td>
                <td className="text-right px-4 py-2.5 text-gray-500">{formatSize(item.size)}</td>
                <td className="text-right px-4 py-2.5 text-gray-500">{formatDate(item.mtime)}</td>
                <td />
              </tr>
            );
          })}
        </tbody>
      </table>

      {sorted.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <p>No files</p>
        </div>
      )}
    </div>
  );
}
