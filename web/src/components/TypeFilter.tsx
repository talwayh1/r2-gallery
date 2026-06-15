import type { FileItem } from '../types';

export type TypeFilter = 'all' | 'image' | 'video' | 'audio' | 'document';

interface Props {
  files: Record<string, FileItem>;
  active: TypeFilter;
  onChange: (f: TypeFilter) => void;
}

const FILTERS: { key: TypeFilter; label: string; icon: string }[] = [
  { key: 'all', label: '全部', icon: '📁' },
  { key: 'image', label: '图片', icon: '🖼️' },
  { key: 'video', label: '视频', icon: '🎬' },
  { key: 'audio', label: '音频', icon: '🎵' },
  { key: 'document', label: '文档', icon: '📄' },
];

function getCount(files: Record<string, FileItem>, filter: TypeFilter): number {
  if (filter === 'all') return Object.keys(files).length;
  return Object.values(files).filter((f) => matchFilter(f.mime, filter)).length;
}

function matchFilter(mime: string, filter: TypeFilter): boolean {
  switch (filter) {
    case 'image': return mime.startsWith('image/');
    case 'video': return mime.startsWith('video/');
    case 'audio': return mime.startsWith('audio/');
    case 'document':
      return mime === 'application/pdf' ||
        mime.startsWith('text/') ||
        mime.includes('document') ||
        mime.includes('spreadsheet') ||
        mime.includes('presentation') ||
        mime.includes('msword') ||
        mime.includes('excel') ||
        mime.includes('powerpoint');
    default: return true;
  }
}

export { matchFilter };

export default function TypeFilter({ files, active, onChange }: Props) {
  const counts = FILTERS.map((f) => ({
    ...f,
    count: getCount(files, f.key),
  }));

  // Only show filters that have at least 1 file of that type
  const visibleFilters = counts.filter((f) => f.key === 'all' || f.count > 0);

  // Hide entirely if only 'all' has items (nothing to filter by)
  if (visibleFilters.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
      {counts.map((f) => {
        if (f.key !== 'all' && f.count === 0) return null;
        return (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              active === f.key
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <span>{f.icon}</span>
            <span>{f.label}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              active === f.key
                ? 'bg-blue-200 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              {f.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
