import { useState, useEffect, useRef } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
import type { LayoutMode, ThemeMode } from '../types';
import FileTypeIcon from './FileTypeIcon';

interface Props {
  dir: string;
  layout: LayoutMode;
  theme: ThemeMode;
  search: string;
  user: string | null;
  sidebarOpen: boolean;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  typeFilter: string;
  isMobile: boolean;
  fileCount?: number;
  dirCount?: number;
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
  onMemoriesClick?: () => void;
  onStatsClick?: () => void;
  onSettingsClick?: () => void;
  onTrashClick?: () => void;
  onActivityClick?: () => void;
  onSortChange?: (sort: string, order: 'asc' | 'desc') => void;
  onTypeFilterChange?: (type: string) => void;
  hideLoginButton?: boolean;
  selectMode?: boolean;
  onSelectModeToggle?: () => void;
  onDelete?: (paths: string[]) => void;
}

const LAYOUTS: { key: LayoutMode; label: string; icon: React.ReactNode }[] = [
  { key: 'grid', label: '网格', icon: '▦' },
  { key: 'rows', label: '行', icon: '☰' },
  { key: 'list', label: '列表', icon: '≡' },
  { key: 'imagelist', label: '图片列表', icon: <FileTypeIcon mime="image/jpeg" className="w-4 h-4" /> },
  { key: 'blocks', label: '块', icon: '▣' },
  { key: 'columns', label: '列', icon: '⫼' },
];

const SORTS: { key: string; label: string; icon: string }[] = [
  { key: 'name', label: '名称', icon: '🔤' },
  { key: 'size', label: '大小', icon: '📏' },
  { key: 'mtime', label: '时间', icon: '🕐' },
  { key: 'kind', label: '类型', icon: '📑' },
  { key: 'shuffle', label: '随机', icon: '🔀' },
];

const TYPE_FILTERS: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: '全部', icon: <FileTypeIcon mime='application/pdf' className='w-4 h-4' /> },
  { key: 'image', label: '图片', icon: <FileTypeIcon mime='image/jpeg' className='w-4 h-4' /> },
  { key: 'video', label: '视频', icon: <FileTypeIcon mime='video/mp4' className='w-4 h-4' /> },
  { key: 'audio', label: '音频', icon: <FileTypeIcon mime='audio/mp3' className='w-4 h-4' /> },
  { key: 'document', label: '文档', icon: <FileTypeIcon mime='application/pdf' className='w-4 h-4' /> },
];

const LANGUAGES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
];

export default function Header({
  dir, layout, theme, search, user, sidebarOpen, sortBy, sortOrder, typeFilter, isMobile, fileCount, dirCount,
  onNavigate, onLayoutChange, onThemeToggle, onSearchChange,
  onSidebarToggle, onLogout, onRefresh, onLoginClick, onShortcutsClick,
  onCreateFolder, onSearchClick, onDiscoverClick, onMemoriesClick, onStatsClick, onSettingsClick, onTrashClick, onActivityClick, onSortChange, onTypeFilterChange, hideLoginButton, selectMode, onSelectModeToggle, onDelete,
}: Props) {
  const breadcrumbs = dir ? dir.split('/') : [];
  const [canInstall, setCanInstall] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [dirMenuOpen, setDirMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [mobileLangOpen, setMobileLangOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const moreRef = useClickOutside<HTMLDivElement>(() => setMoreOpen(false), moreOpen);
  const layoutRef = useClickOutside<HTMLDivElement>(() => setLayoutOpen(false), layoutOpen);
  const dirMenuRef = useClickOutside<HTMLDivElement>(() => setDirMenuOpen(false), dirMenuOpen);
  const langRef = useClickOutside<HTMLDivElement>(() => setLangOpen(false), langOpen);

  // Close mobile filter bar on Escape key
  useEffect(() => {
    if (!mobileFilterOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileFilterOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileFilterOpen]);

  // Listen for PWA install prompt availability
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setCanInstall(false));
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const closeMore = () => {
    setMoreOpen(false);
    setMobileLangOpen(false);
  };

  return (
    <>
    <header className="h-14 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0 sticky top-0 z-40">
      {/* Hamburger / sidebar toggle */}
      <button onClick={onSidebarToggle} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg shrink-0">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Breadcrumb nav — hidden on very small screens, shown on sm+ */}
      <nav className="hidden sm:flex items-center gap-1 text-sm overflow-x-auto min-w-0">
        <button onClick={() => onNavigate('')} className="hover:text-blue-500 font-medium whitespace-nowrap">
          <svg className="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> R2 Gallery
        </button>
        {/* Parent directory button */}
        {dir && (
          <>
            <span className="text-gray-400">/</span>
            <button
              onClick={() => {
                const parts = dir.split('/');
                parts.pop();
                onNavigate(parts.join('/'));
              }}
              className="hover:text-blue-500 whitespace-nowrap text-gray-400"
              title="上级目录"
            >
              ..
            </button>
          </>
        )}
        {breadcrumbs.map((part, i) => {
          const isLast = i === breadcrumbs.length - 1;
          const partPath = breadcrumbs.slice(0, i + 1).join('/');
          return (
            <span key={i} className="flex items-center gap-1 relative" ref={isLast ? dirMenuRef : undefined}>
              <span className="text-gray-400">/</span>
              {isLast && dir ? (
                <button
                  onClick={() => setDirMenuOpen(!dirMenuOpen)}
                  className="hover:text-blue-500 whitespace-nowrap flex items-center gap-0.5"
                  title="目录操作"
                >
                  {part}
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={() => onNavigate(partPath)}
                  className="hover:text-blue-500 whitespace-nowrap"
                >
                  {part}
                </button>
              )}
              {isLast && dirMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    onClick={() => { onRefresh?.(); setDirMenuOpen(false); }}
                  >
                    <span>🔄</span><span>刷新</span>
                  </button>
                  {user && (
                    <>
                      <button
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                        onClick={() => { onCreateFolder?.(); setDirMenuOpen(false); }}
                      >
                        <span className="flex items-center"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg></span><span>新建文件夹</span>
                      </button>
                      <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                      <button
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500 flex items-center gap-2"
                        onClick={() => {
                          if (confirm(`确认删除文件夹 "${dir}" 及其所有内容？`)) {
                            onDelete?.([dir]);
                          }
                          setDirMenuOpen(false);
                        }}
                      >
                        <span className="flex items-center"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></span><span>删除此文件夹</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </span>
          );
        })}
      </nav>

      {/* Mobile-only title — clickable to navigate to parent */}
      <button
        onClick={() => {
          if (!dir) return;
          const parent = dir.split('/').slice(0, -1).join('/');
          onNavigate(parent);
        }}
        className="sm:hidden text-sm font-medium min-w-0 flex-shrink hover:text-blue-500 transition-colors"
        title={dir ? '点击前往上级目录' : undefined}
      >
        <svg className="w-4 h-4 inline-block flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        <span className="truncate ml-1">{breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1] : 'R2 Gallery'}</span>
        {(fileCount !== undefined || dirCount !== undefined) && (
          <span className="ml-1.5 text-[11px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/50 rounded-full px-1.5 py-0.5 leading-none whitespace-nowrap flex-shrink-0">
            {fileCount !== undefined && fileCount > 0 ? `${fileCount}个文件` : dirCount !== undefined && dirCount > 0 ? `${dirCount}个目录` : ''}
          </span>
        )}
      </button>

      <div className="flex-1" />

      {/* Sort & Type filter controls — desktop only */}
      {!isMobile && (
        <div className="flex items-center gap-1 border-r border-gray-200 dark:border-gray-700 pr-2 mr-1">
          {/* Sort buttons */}
          {onSortChange && (
            <div className="flex items-center gap-0.5">
              {SORTS.map((s) => (
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
              {TYPE_FILTERS.map((t) => (
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
      )}

      {/* Inline file name filter — desktop only */}
      {!isMobile && (
        <div className="flex items-center gap-1 mr-1">
          <div className="relative">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="过滤器..."
              className="w-28 pl-7 pr-7 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
              title="在当前目录中按名称过滤文件"
            />
            {search && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Right-side actions */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Search: icon-only on mobile, full bar on desktop */}
        <button
          onClick={onSearchClick}
          className={`flex items-center gap-2 px-2 py-1.5 sm:px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-text ${
            isMobile ? 'w-auto' : 'w-40'
          }`}
          title="搜索所有文件 (Ctrl+K / )"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {!isMobile && (
            <>
              <span className="truncate">搜索...</span>
              <kbd className="ml-auto text-[10px] bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded">/</kbd>
            </>
          )}
        </button>

        {/* Select mode toggle */}
        {onSelectModeToggle && (
          <button
            onClick={onSelectModeToggle}
            className={`p-2 rounded-lg transition-colors ${selectMode ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            title={selectMode ? '退出选择模式' : '选择模式'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </button>
        )}

        {/* Desktop: show all action buttons inline */}
        {!isMobile && (
          <>
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

            {/* Memories button (On this day) */}
            {onMemoriesClick && (
              <button
                onClick={onMemoriesClick}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                title="那年今日"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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

            {/* Layout dropdown */}
            <div className="relative" ref={layoutRef}>
              <button
                onClick={() => setLayoutOpen(!layoutOpen)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                title={`布局: ${LAYOUTS.find(l => l.key === layout)?.label || layout}`}
              >
                <span className="text-sm">{LAYOUTS.find(l => l.key === layout)?.icon || '▦'}</span>
              </button>
              {layoutOpen && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.key}
                      onClick={() => { onLayoutChange(l.key); setLayoutOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        layout === l.key ? 'text-blue-600 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <span>{l.icon}</span>
                      <span>{l.label}</span>
                      {layout === l.key && <span className="ml-auto text-xs">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

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

            {/* Language switcher */}
            <div className="relative" ref={langRef}>
              <button
                onClick={() => setLangOpen(!langOpen)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                title="语言"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                </svg>
              </button>
              {langOpen && (
                <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        localStorage.setItem('language', lang.code);
                        setLangOpen(false);
                        window.location.reload();
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        localStorage.getItem('language') === lang.code ? 'text-blue-600 dark:text-blue-400 font-medium' : ''
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

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

            {/* Desktop settings button */}
            {onSettingsClick && (
              <button
                onClick={onSettingsClick}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                title="设置"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}

            {/* Desktop language switcher */}
          </>
        )}
        {/* Desktop language switcher end */}

        {/* Mobile: inline action buttons before More menu */}  
        {isMobile && (
          <>
            {/* Mobile layout cycle button */}
            <button
              onClick={() => {
                const idx = LAYOUTS.findIndex(l => l.key === layout);
                const next = LAYOUTS[(idx + 1) % LAYOUTS.length];
                onLayoutChange(next.key);
              }}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg shrink-0"
              title={`布局: ${LAYOUTS.find(l => l.key === layout)?.label || layout}`}
            >
              <span className="text-base">{LAYOUTS.find(l => l.key === layout)?.icon || '▦'}</span>
            </button>
            {/* Mobile refresh button */}
            <button onClick={onRefresh} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg shrink-0" title="刷新">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            {/* Mobile theme toggle */}
            <button onClick={onThemeToggle} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg shrink-0" title="切换主题">
              {theme === 'dark' ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            {/* Mobile filter toggle */}
            <button onClick={() => setMobileFilterOpen(!mobileFilterOpen)} className={`p-1.5 rounded-lg shrink-0 transition-colors ${mobileFilterOpen ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="筛选">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </>
        )}

        {/* Mobile: "More" dropdown menu */}
        {isMobile && (
          <div className="relative" ref={moreRef}>
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              title="更多操作"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>

            {moreOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
                {mobileLangOpen ? (
                  <>
                    {/* Language submenu header with back button */}
                    <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 mb-1">
                      <button
                        onClick={() => setMobileLangOpen(false)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        title="返回"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">选择语言</span>
                    </div>
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => {
                          localStorage.setItem('language', lang.code);
                          closeMore();
                          window.location.reload();
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          localStorage.getItem('language') === lang.code ? 'text-blue-600 dark:text-blue-400 font-medium' : ''
                        }`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </>
                ) : (
                <>
                {/* Sort submenu */}
                {onSortChange && (
                  <>
                    <div className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">排序</div>
                    {SORTS.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => {
                          if (sortBy === s.key) {
                            onSortChange(s.key, sortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            onSortChange(s.key, 'asc');
                          }
                          closeMore();
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          sortBy === s.key ? 'text-blue-600 dark:text-blue-400 font-medium' : ''
                        }`}
                      >
                        <span>{s.icon}</span>
                        <span>{s.label}</span>
                        {sortBy === s.key && (
                          <span className="ml-auto text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    ))}
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                  </>
                )}

                {/* Type filter submenu */}
                {onTypeFilterChange && (
                  <>
                    <div className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">类型筛选</div>
                    {TYPE_FILTERS.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => {
                          onTypeFilterChange(t.key);
                          closeMore();
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          typeFilter === t.key ? 'text-green-600 dark:text-green-400 font-medium' : ''
                        }`}
                      >
                        <span>{t.icon}</span>
                        <span>{t.label}</span>
                      </button>
                    ))}
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                  </>
                )}

                {/* Layout submenu */}
                <div className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">布局</div>
                {LAYOUTS.map((l) => (
                  <button
                    key={l.key}
                    onClick={() => { onLayoutChange(l.key); closeMore(); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      layout === l.key ? 'text-blue-600 dark:text-blue-400 font-medium' : ''
                    }`}
                  >
                    <span>{l.icon}</span>
                    <span>{l.label}</span>
                    {layout === l.key && <span className="ml-auto text-xs">✓</span>}
                  </button>
                ))}
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />

                {/* Action items */}
                {onDiscoverClick && (
                  <button onClick={() => { onDiscoverClick(); closeMore(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
                    <span>⭐</span><span>发现</span>
                  </button>
                )}
                {onMemoriesClick && (
                  <button onClick={() => { onMemoriesClick(); closeMore(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
                    <span>💭</span><span>那年今日</span>
                  </button>
                )}
                {user && onCreateFolder && (
                  <button onClick={() => { onCreateFolder(); closeMore(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
                    <span className="flex items-center"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg></span><span>新建文件夹</span>
                  </button>
                )}
                {user && onStatsClick && (
                  <button onClick={() => { onStatsClick(); closeMore(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
                    <span>📊</span><span>存储统计</span>
                  </button>
                )}
                {user && onTrashClick && (
                  <button onClick={() => { onTrashClick(); closeMore(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
                    <span className="flex items-center"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></span><span>回收站</span>
                  </button>
                )}
                {user && onActivityClick && (
                  <button onClick={() => { onActivityClick(); closeMore(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
                    <span>📋</span><span>活动日志</span>
                  </button>
                )}
                {onSettingsClick && (
                  <button onClick={() => { onSettingsClick(); closeMore(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
                    <span>⚙️</span><span>设置</span>
                  </button>
                )}
                <button onClick={() => { onRefresh(); closeMore(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
                  <span>🔄</span><span>刷新</span>
                </button>
                <button onClick={() => { onThemeToggle(); closeMore(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
                  <span>{theme === 'dark' ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>}</span><span>切换主题</span>
                </button>
                <button onClick={() => { onShortcutsClick?.(); closeMore(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
                  <span>⚡</span><span>快捷键</span>
                </button>
                <button onClick={() => { setMobileLangOpen(true); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
                  <span>🌐</span><span>语言</span>
                </button>
                {canInstall && (
                  <button onClick={async () => { const accepted = await (window as any).installPWA(); if (accepted) setCanInstall(false); closeMore(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
                    <span>📲</span><span>安装应用</span>
                  </button>
                )}
                </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Language button for mobile — always visible in More menu */}

        {/* User info / login — always visible */}
        {user ? (
          <div className="flex items-center gap-2 pl-2 border-l border-gray-200 dark:border-gray-700">
            {!isMobile && <span className="text-sm text-gray-500">{user}</span>}
            <button onClick={onLogout} className="text-sm text-red-500 hover:text-red-600 p-1.5" title="退出登录">
              {isMobile ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              ) : (
                '退出'
              )}
            </button>
          </div>
        ) : !hideLoginButton ? (
          <button
            onClick={onLoginClick}
            className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            管理登录
          </button>
        ) : null}
      </div>
      </header>

        {/* Mobile inline filter bar — outside header flex to avoid layout breakage */}
        {isMobile && mobileFilterOpen && (
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-14 z-30 space-y-2 shadow-sm">
            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-1.5">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="筛选文件名..."
                className="flex-1 bg-transparent text-sm outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400"
                autoFocus
              />
              {search && (
                <button
                  onClick={() => onSearchChange('')}
                  className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {/* Mobile sort chips */}
            {onSortChange && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => {
                      if (sortBy === s.key) {
                        onSortChange(s.key, sortOrder === 'asc' ? 'desc' : 'asc');
                      } else {
                        onSortChange(s.key, 'asc');
                      }
                    }}
                    className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      sortBy === s.key
                        ? 'bg-blue-500 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="text-[11px]">{s.icon}</span>
                    <span>{s.label}</span>
                    {sortBy === s.key && <span className="text-[10px]">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                ))}
              </div>
            )}
            {/* Mobile type filter chips */}
            {onTypeFilterChange && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {TYPE_FILTERS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => onTypeFilterChange(t.key)}
                    className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      typeFilter === t.key
                        ? 'bg-green-500 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="text-[11px]">{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </>
  );
}