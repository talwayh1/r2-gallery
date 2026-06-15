import type { LayoutMode, ThemeMode } from '../types';

interface Props {
  dir: string;
  layout: LayoutMode;
  theme: ThemeMode;
  search: string;
  user: string | null;
  sidebarOpen: boolean;
  onLayoutChange: (l: LayoutMode) => void;
  onThemeToggle: () => void;
  onSearchChange: (s: string) => void;
  onSidebarToggle: () => void;
  onLogout: () => void;
  onRefresh: () => void;
  onLoginClick?: () => void;
}

export default function Header({
  dir, layout, theme, search, user, sidebarOpen,
  onLayoutChange, onThemeToggle, onSearchChange,
  onSidebarToggle, onLogout, onRefresh, onLoginClick,
}: Props) {
  const breadcrumbs = dir ? dir.split('/') : [];

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

      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="搜索..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-40 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
        />

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

  function onNavigate(path: string) {
    window.dispatchEvent(new CustomEvent('navigate', { detail: path }));
  }
}
