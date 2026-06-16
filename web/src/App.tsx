import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import type { FileItem, LayoutMode } from './types';
import { useAuth } from './hooks/useAuth';
import { useTheme } from './hooks/useTheme';
import { toast } from './hooks/useToast';
import { listFiles, telegramLogin, getConfig, mkdir, getFileUrl } from './api';
import type { ListFilesParams } from './api';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import FileGrid from './components/FileGrid';
import FileList from './components/FileList';
import UploadZone from './components/UploadZone';
import Login from './components/Login';
import BulkActions from './components/BulkActions';
import TypeFilter, { matchFilter } from './components/TypeFilter';
import type { TypeFilter as TypeFilterKind } from './components/TypeFilter';
import CreateFolder from './components/CreateFolder';
import InstallPrompt from './components/InstallPrompt';

// Lazy-loaded components (not needed for first paint)
const Lightbox = lazy(() => import('./components/Lightbox'));
const KeyboardShortcuts = lazy(() => import('./components/KeyboardShortcuts'));
const SearchOverlay = lazy(() => import('./components/SearchOverlay'));
const DiscoverPage = lazy(() => import('./components/DiscoverPage'));
const BatchRename = lazy(() => import('./components/BatchRename'));
const StatsPanel = lazy(() => import('./components/StatsPanel'));

const LazyLoading = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
  </div>
);

export default function App() {
  const { user, loading: authLoading, login, logout } = useAuth();
  const { mode: theme, toggle: toggleTheme } = useTheme();
  const [dir, setDir] = useState('');
  const [files, setFiles] = useState<Record<string, FileItem>>({});
  const [dirs, setDirs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>(() => {
    return (localStorage.getItem('layout') as LayoutMode) || 'grid';
  });
  const [lightbox, setLightbox] = useState<{ index: number } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [search, setSearch] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const [telegramBotUsername, setTelegramBotUsername] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // New features state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<TypeFilterKind>('all');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'mtime'>(() => {
    return (localStorage.getItem('sortBy') as 'name' | 'size' | 'mtime') || 'name';
  });
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(() => {
    return (localStorage.getItem('sortOrder') as 'asc' | 'desc') || 'asc';
  });
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showBatchRename, setShowBatchRename] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  // Track pending /view/* deep link
  const pendingViewRef = useRef<string | null>(null);
  const initialDirSetRef = useRef(false);

  const loadFiles = useCallback(async (d: string, append = false) => {
    setLoading(true);
    try {
      const params: ListFilesParams = { sort: sortBy, order: sortOrder, type: typeFilter };
      if (append && cursor) {
        params.cursor = cursor;
        params.limit = 100;
      }
      const data = await listFiles(d, params);
      if (append) {
        setFiles(prev => ({ ...prev, ...(data.files || {}) }));
      } else {
        setFiles(data.files || {});
      }
      setDirs(data.dirs || []);
      setHasMore(data.hasMore || false);
      setCursor(data.cursor);
    } catch (e) {
      console.error('Failed to load files:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [sortBy, sortOrder, typeFilter, cursor]);

  // Handle /view/* deep links on mount
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/view/')) {
      const filePath = decodeURIComponent(path.slice(6));
      if (filePath) {
        pendingViewRef.current = filePath;
        // Navigate to the parent directory
        const parts = filePath.split('/');
        parts.pop();
        const parentDir = parts.join('/');
        setDir(parentDir);
        initialDirSetRef.current = true;
      }
    }
  }, []);

  useEffect(() => {
    setCursor(undefined);
    setHasMore(false);
    loadFiles(dir);
  }, [dir, sortBy, sortOrder, typeFilter]);

  // Clear selection and type filter when directory changes
  useEffect(() => {
    setSelected(new Set());
    // Don't reset typeFilter on dir change - keep user preference
  }, [dir]);

  // Fetch public config (Telegram bot username, hide login button)
  const [hideLoginButton, setHideLoginButton] = useState(false);
  useEffect(() => {
    getConfig().then((data) => {
      if (data.telegramBotUsername) setTelegramBotUsername(data.telegramBotUsername);
      if (data.hideLoginButton) setHideLoginButton(true);
    }).catch(console.error);
  }, []);

  // Track viewport size
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Global keyboard shortcuts (non-lightbox)
  useEffect(() => {
    if (lightbox) return; // Lightbox has its own handler

    const handleKey = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setShowShortcuts((s) => !s);
      } else if (e.key === '/' && !e.shiftKey) {
        e.preventDefault();
        setShowSearch(true);
      } else if (e.key === 'r' || e.key === 'R') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          loadFiles(dir);
        }
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        const newLayout = layout === 'grid' ? 'rows' : 'grid';
        setLayout(newLayout);
        localStorage.setItem('layout', newLayout);
      } else if (e.key === 't' || e.key === 'T') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          toggleTheme();
        }
      } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        // Ctrl+A — select all files (prevent browser default)
        e.preventDefault();
        const filteredKeys = Object.keys(filteredFiles);
        setSelected(new Set(filteredKeys));
      } else if (e.key === 'Escape' && selected.size > 0) {
        e.preventDefault();
        setSelected(new Set());
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [lightbox, dir, layout, loadFiles, toggleTheme, selected.size, files]);

  const navigate = useCallback((path: string) => {
    setDir(path);
    setSearch('');
    if (isMobile) setSidebarOpen(false);
    // Clear /view/* URL when navigating normally
    if (window.location.pathname.startsWith('/view/')) {
      window.history.replaceState(null, '', '/');
    }
  }, [isMobile]);

  // Apply type filter + search filter
  const filteredFiles = Object.fromEntries(
    Object.entries(files).filter(([name, f]) => {
      if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter !== 'all' && !matchFilter(f.mime, typeFilter)) return false;
      return true;
    })
  );

  // Build media items list for lightbox navigation
  const mediaItems = Object.entries(filteredFiles)
    .filter(([, f]) => f.mime.startsWith('image/') || f.mime.startsWith('video/') || f.mime.startsWith('audio/'))
    .map(([, f]) => ({ path: f.path, mime: f.mime, size: f.size }));

  // Auto-open lightbox for /view/* deep links
  useEffect(() => {
    if (pendingViewRef.current && mediaItems.length > 0 && !loading) {
      const filePath = pendingViewRef.current;
      const idx = mediaItems.findIndex(item => item.path === filePath);
      if (idx >= 0) {
        pendingViewRef.current = null;
        setLightbox({ index: idx });
      } else {
        // File not found in current directory media items — clear pending
        pendingViewRef.current = null;
      }
    }
  }, [mediaItems, loading]);

  const openLightbox = useCallback((path: string, _mime: string) => {
    const idx = mediaItems.findIndex(item => item.path === path);
    setLightbox({ index: idx >= 0 ? idx : 0 });
    // Update URL for sharing
    window.history.replaceState(null, '', `/view/${encodeURIComponent(path)}`);
  }, [mediaItems]);

  const handleLightboxNavigate = useCallback((newIndex: number) => {
    setLightbox({ index: newIndex });
    const newPath = mediaItems[newIndex]?.path;
    if (newPath) {
      window.history.replaceState(null, '', `/view/${encodeURIComponent(newPath)}`);
    }
  }, [mediaItems]);

  const handleLightboxClose = useCallback(() => {
    setLightbox(null);
    // Restore clean URL
    if (window.location.pathname.startsWith('/view/')) {
      window.history.replaceState(null, '', '/');
    }
  }, []);

  const handleDelete = async (paths: string[]) => {
    const { deleteItems } = await import('./api');
    try {
      await deleteItems(paths);
      toast('success', `已删除 ${paths.length} 个项目`);
      loadFiles(dir);
    } catch (e) {
      toast('error', `删除失败: ${(e as Error).message}`);
    }
  };

  const handleRename = async (path: string, name: string) => {
    const { renameItem } = await import('./api');
    try {
      await renameItem(path, name);
      toast('success', `已重命名为 "${name}"`);
      loadFiles(dir);
    } catch (e) {
      toast('error', `重命名失败: ${(e as Error).message}`);
    }
  };

  // Selection handlers
  const handleSelect = useCallback((path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelected(new Set(Object.keys(filteredFiles)));
  }, [filteredFiles]);

  const handleDeselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  // Batch operations
  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    const paths = Array.from(selected);
    await handleDelete(paths);
    setSelected(new Set());
  };

  const handleBatchDownload = () => {
    if (selected.size === 0) return;
    const paths = Array.from(selected);
    toast('info', `正在下载 ${paths.length} 个文件...`);
    paths.forEach((path, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = getFileUrl(path) + '&download=1';
        a.download = path.split('/').pop() || 'file';
        a.click();
      }, i * 300);
    });
  };

  // Create folder
  const handleCreateFolder = async (name: string) => {
    const folderPath = dir ? `${dir}/${name}` : name;
    try {
      await mkdir(folderPath);
      toast('success', `已创建文件夹 "${name}"`);
      setShowCreateFolder(false);
      loadFiles(dir);
    } catch (e) {
      toast('error', `创建文件夹失败: ${(e as Error).message}`);
    }
  };

  // Create file
  const handleCreateFile = async (path: string) => {
    try {
      const { createFile } = await import('./api');
      await createFile(path);
      toast('success', `已创建文件 "${path.split('/').pop()}"`);
      setShowCreateFolder(false);
      loadFiles(dir);
    } catch (e) {
      toast('error', `创建文件失败: ${(e as Error).message}`);
    }
  };

  // Create URL shortcut
  const handleCreateUrl = async (path: string, url: string) => {
    try {
      const { createUrlShortcut } = await import('./api');
      await createUrlShortcut(path, url);
      toast('success', `已创建链接 "${path.split('/').pop()}"`);
      setShowCreateFolder(false);
      loadFiles(dir);
    } catch (e) {
      toast('error', `创建链接失败: ${(e as Error).message}`);
    }
  };

  // Load more handler for infinite scroll
  const loadMore = useCallback(() => {
    if (loadingMore || loading || !hasMore || !cursor) return;
    setLoadingMore(true);
    loadFiles(dir, true);
  }, [loadingMore, loading, hasMore, cursor, dir, loadFiles]);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Header
        dir={dir}
        layout={layout}
        theme={theme}
        search={search}
        user={user}
        sidebarOpen={sidebarOpen}
        sortBy={sortBy}
        sortOrder={sortOrder}
        typeFilter={typeFilter}
        isMobile={isMobile}
        onNavigate={navigate}
        onLayoutChange={(l) => { setLayout(l); localStorage.setItem('layout', l); }}
        onThemeToggle={toggleTheme}
        onSearchChange={setSearch}
        onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
        onLogout={logout}
        onRefresh={() => loadFiles(dir)}
        onLoginClick={() => setShowLogin(true)}
        onShortcutsClick={() => setShowShortcuts(true)}
        onCreateFolder={user ? () => setShowCreateFolder(true) : undefined}
        onSearchClick={() => setShowSearch(true)}
        onDiscoverClick={() => setShowDiscover(true)}
        onStatsClick={user ? () => setShowStats(true) : undefined}
        onSortChange={(sort, order) => {
          setSortBy(sort);
          setSortOrder(order);
          localStorage.setItem('sortBy', sort);
          localStorage.setItem('sortOrder', order);
        }}
        onTypeFilterChange={(t) => setTypeFilter(t as TypeFilterKind)}
        hideLoginButton={hideLoginButton}
      />
      <InstallPrompt />
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile sidebar overlay */}
        {isMobile && sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/40 top-14" onClick={() => setSidebarOpen(false)} />
        )}
        {/* Sidebar */}
        <div className={`
          ${sidebarOpen ? 'block' : 'hidden'}
          ${isMobile ? 'fixed left-0 top-14 bottom-0 z-40 shadow-xl' : ''}
        `}>
          <Sidebar currentDir={dir} onNavigate={navigate} />
        </div>
        {/* Main content */}
        <main className="flex-1 overflow-auto p-4">
          {/* Type filter bar */}
          <div className="mb-3 hidden sm:block">
            <TypeFilter
              files={files}
              active={typeFilter}
              onChange={setTypeFilter}
            />
          </div>

          {user ? (
            <UploadZone dir={dir} onUpload={() => loadFiles(dir)}>
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                </div>
              ) : layout === 'grid' ? (
                <FileGrid
                  files={filteredFiles}
                  dirs={dirs}
                  currentDir={dir}
                  onNavigate={navigate}
                  onOpen={openLightbox}
                  onDelete={handleDelete}
                  onRename={handleRename}
                  onMove={() => loadFiles(dir)}
                  selected={selected}
                  onSelect={handleSelect}
                  onLoadMore={loadMore}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                />
              ) : (
                <FileList
                  files={filteredFiles}
                  dirs={dirs}
                  currentDir={dir}
                  onNavigate={navigate}
                  onOpen={openLightbox}
                  onDelete={handleDelete}
                  onRename={handleRename}
                  selected={selected}
                  onSelect={handleSelect}
                />
              )}
            </UploadZone>
          ) : (
            loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
              </div>
            ) : layout === 'grid' ? (
              <FileGrid
                files={filteredFiles}
                dirs={dirs}
                currentDir={dir}
                onNavigate={navigate}
                onOpen={openLightbox}
                onMove={() => loadFiles(dir)}
                selected={selected}
                onSelect={handleSelect}
                onLoadMore={loadMore}
                hasMore={hasMore}
                loadingMore={loadingMore}
              />
            ) : (
              <FileList
                files={filteredFiles}
                dirs={dirs}
                currentDir={dir}
                onNavigate={navigate}
                onOpen={openLightbox}
                selected={selected}
                onSelect={handleSelect}
              />
            )
          )}
        </main>
      </div>

      {/* Bulk selection action bar */}
      {selected.size > 0 && (
        <BulkActions
          selectedCount={selected.size}
          totalCount={Object.keys(filteredFiles).length}
          onDelete={handleBatchDelete}
          onDownload={handleBatchDownload}
          onBatchRename={user ? () => setShowBatchRename(true) : undefined}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
        />
      )}

      {lightbox && mediaItems.length > 0 && (
        <Suspense fallback={<LazyLoading />}>
          <Lightbox
            items={mediaItems}
            index={lightbox.index}
            onClose={handleLightboxClose}
            onNavigate={handleLightboxNavigate}
          />
        </Suspense>
      )}
      {showLogin && !user && (
        <Login
          telegramBotUsername={telegramBotUsername || undefined}
          onLogin={async (username: string, password: string) => {
            const result = await login(username, password);
            if (result?.token) setShowLogin(false);
            return result;
          }}
          onTelegramLogin={async (authData: Record<string, string>) => {
            const result = await telegramLogin(authData);
            if (result?.token) {
              window.location.reload();
            }
            return result;
          }}
          onClose={() => setShowLogin(false)}
        />
      )}
      {showShortcuts && (
        <Suspense fallback={<LazyLoading />}>
          <KeyboardShortcuts onClose={() => setShowShortcuts(false)} />
        </Suspense>
      )}
      {showCreateFolder && (
        <CreateFolder
          currentDir={dir}
          onConfirm={handleCreateFolder}
          onCreateFile={handleCreateFile}
          onCreateUrl={handleCreateUrl}
          onClose={() => setShowCreateFolder(false)}
        />
      )}
      {showSearch && (
        <Suspense fallback={<LazyLoading />}>
          <SearchOverlay
            onClose={() => setShowSearch(false)}
            onNavigate={(d) => { navigate(d); setShowSearch(false); }}
            onOpenFile={(path, mime) => { openLightbox(path, mime); setShowSearch(false); }}
          />
        </Suspense>
      )}
      {showDiscover && (
        <Suspense fallback={<LazyLoading />}>
          <DiscoverPage
            onClose={() => setShowDiscover(false)}
            onNavigate={(d) => { navigate(d); setShowDiscover(false); }}
            onOpenFile={(path, mime) => { openLightbox(path, mime); setShowDiscover(false); }}
          />
        </Suspense>
      )}
      {showBatchRename && user && (
        <Suspense fallback={<LazyLoading />}>
          <BatchRename
            selectedFiles={Array.from(selected)}
            onDone={() => { setShowBatchRename(false); setSelected(new Set()); loadFiles(dir); }}
            onClose={() => setShowBatchRename(false)}
          />
        </Suspense>
      )}
      {showStats && user && (
        <Suspense fallback={<LazyLoading />}>
          <StatsPanel onClose={() => setShowStats(false)} />
        </Suspense>
      )}
    </div>
  );
}
