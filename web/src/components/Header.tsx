import { useState, useEffect } from 'react';
import type { LayoutMode, ThemeMode } from '../types';

interface Props {
  dir: string;
  layout: LayoutMode;
  theme: ThemeMode;
  search: string;
  user: string | null;
  sidebarOpen: boolean;
  sortBy: 'name' | 'size' | 'mtime';
  sortOrder: 'asc' | 'desc';
  typeFilter: string;
  onNavigate: (path: string) => void;
  onLayoutChange: (l: LayoutMode) => void;
  onThemeToggle: () => void;
  onSearchChange: (s: string) => void;
  onSidebarToggle: () => void;
  onLogout: () => void;
  onRefresh: () => void;
  onLoginClick?: () => void;
  onShortcutsClick?: () => void;
  onCreateFolder?: () => void;
  onSearchClick?: () => void;
  onDiscoverClick?: () => void;
  onStatsClick?: () => void;
  onSortChange?: (sort: 'name' | 'size' | 'mtime', order: 'asc' | 'desc') => void;
  onTypeFilterChange?: (type: string) => void;
}

export default function Header({
  dir, layout, theme, search, user, sidebarOpen, sortBy, sortOrder, typeFilter,
  onNavigate, onLayoutChange, onThemeToggle, onSearchChange,
  onSidebarToggle, onLogout, onRefresh, onLoginClick, onShortcutsClick,
  onCreateFolder, onSearchClick, onDiscoverClick, onStatsClick, onSortChange, onTypeFilterChange,
}: Props) {
  const breadcrumbs = dir ? dir.split('/') : [];
  const [canInstall, setCanInstall] = useState(false);

  // Listen for PWA install prompt availability
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    // Also hide button once app is installed
    window.addEventListener('appinstalled', () => setCanInstall(false));
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  return (
    <header className="h-14 flex items-center gap-3 px-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
      <button onClick={onSidebarToggle} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <nav className="flex items-center gap-1 text-sm overflow-x-auto">
        <button onClick={() => onNavigate('')} className="hover:text-blue-500 font-medium whitespace-nowrap">
          🖼️ R2 Gallery
        </button>
        {breadcrumbs.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-gray-400">/</span>
            <button
              onClick={() => onNavigate(breadcrumbs.slice(0, i + 1).join('/'))}
              className="hover:text-blue-500 whitespace-nowrap"
            >
              {part}
            </button>
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Sort & Type filter controls */}
      <div className="flex items-center gap-1 border-r border-gray-200 dark:border-gray-700 pr-2 mr-1">
        {/* Sort buttons */}
        {onSortChange && (
          <div className="flex items-center gap-0.5">
            {([
              { key: 'name' as const, label: '名称', icon: '🔤' },
              { key: 'size' as const, label: '大小', icon: '📏' },
              { key: 'mtime' as const, label: '时间', icon: '🕐' },
            ]).map((s) => (
              <button
                key={s.key}
                onClick={() => {
                  if (sortBy === s.key) {
                    onSortChange(s.key, sortOrder === 'asc' ? 'desc' : 'asc');
                  } else {
                    onSortChange(s.key, 'asc');
                  }
                }}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  sortBy === s.key
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title={`按${s.label}排序 (当前: ${sortBy === s.key ? (sortOrder === 'asc' ? '升序' : '降序') : '未选'})`}
              >
                {s.icon}{sortBy === s.key ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </button>
            ))}
          </div>
        )}
        {/* Type filter */}
        {onTypeFilterChange && (
          <div className="flex items-center gap-0.5">
            {([
              { key: 'all' as const, label: '全部', icon: '📁' },
              { key: 'image' as const, label: '图片', icon: '🖼️' },
              { key: 'video' as const, label: '视频', icon: '🎬' },
              { key: 'audio' as const, label: '音频', icon: '🎵' },
            ]).map((t) => (
              <button
                key={t.key}
                onClick={() => onTypeFilterChange(t.key)}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  typeFilter === t.key
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 font-medium'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title={t.label}
              >
                {t.icon}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onSearchClick}
          className="flex items-center gap-2 w-40 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-text"
          title="搜索所有文件 (/)"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="truncate">搜索...</span>
          <kbd className="ml-auto text-[10px] bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded">/</kbd>
        </button>

        {/* Discover button */}
        {onDiscoverClick && (
          <button
            onClick={onDiscoverClick}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title="发现"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </button>
        )}

        {/* Create folder (admin only) */}
        {user && onCreateFolder && (
          <button
            onClick={onCreateFolder}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title="新建文件夹"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
          </button>
        )}

        {/* Stats (admin only) */}
        {user && onStatsClick && (
          <button
            onClick={onStatsClick}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title="存储统计"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
        )}

        <button onClick={onRefresh} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="刷新">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <button
          onClick={() => onLayoutChange(layout === 'grid' ? 'rows' : 'grid')}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          title={layout === 'grid' ? '列表视图' : '网格视图'}
        >
          {layout === 'grid' ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
          )}
        </button>

        <button onClick={onThemeToggle} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="切换主题">
          {theme === 'dark' ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        <button
          onClick={onShortcutsClick}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          title="键盘快捷键 (?)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </button>

        {/* Install PWA button */}
        {canInstall && (
          <button
            onClick={async () => {
              const accepted = await (window as any).installPWA();
              if (accepted) setCanInstall(false);
            }}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title="安装应用"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18v-6m0 0l-3 3m3-3l3 3M3 15V7a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
          </button>
        )}

        {user ? (
          <div className="flex items-center gap-2 pl-2 border-l border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-500">{user}</span>
            <button onClick={onLogout} className="text-sm text-red-500 hover:text-red-600">退出</button>
          </div>
        ) : (
          <button
            onClick={onLoginClick}
            className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            管理登录
          </button>
        )}
      </div>
    </header>
  );
}
