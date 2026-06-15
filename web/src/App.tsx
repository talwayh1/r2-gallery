import { useState, useEffect, useCallback, useRef } from 'react';
import type { FileItem, LayoutMode } from './types';
import { useAuth } from './hooks/useAuth';
import { useTheme } from './hooks/useTheme';
import { listFiles, telegramLogin, getConfig, mkdir, getFileUrl } from './api';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import FileGrid from './components/FileGrid';
import FileList from './components/FileList';
import Lightbox from './components/Lightbox';
import UploadZone from './components/UploadZone';
import Login from './components/Login';
import KeyboardShortcuts from './components/KeyboardShortcuts';
import BulkActions from './components/BulkActions';
import TypeFilter, { matchFilter } from './components/TypeFilter';
import type { TypeFilter as TypeFilterKind } from './components/TypeFilter';
import CreateFolder from './components/CreateFolder';

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
  const [showCreateFolder, setShowCreateFolder] = useState(false);

  // Track pending /view/* deep link
  const pendingViewRef = useRef<string | null>(null);
  const initialDirSetRef = useRef(false);

  const loadFiles = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const data = await listFiles(d);
      setFiles(data.files || {});
      setDirs(data.dirs || []);
    } catch (e) {
      console.error('Failed to load files:', e);
    } finally {
      setLoading(false);
    }
  }, []);

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
    loadFiles(dir);
  }, [dir, loadFiles]);

  // Clear selection and type filter when directory changes
  useEffect(() => {
    setSelected(new Set());
    setTypeFilter('all');
  }, [dir]);

  // Fetch public config (Telegram bot username)
  useEffect(() => {
    getConfig().then((data) => {
      if (data.telegramBotUsername) setTelegramBotUsername(data.telegramBotUsername);
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
        const input = document.querySelector<HTMLInputElement>('input[placeholder="搜索..."]');
        input?.focus();
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
    await deleteItems(paths);
    loadFiles(dir);
  };

  const handleRename = async (path: string, name: string) => {
    const { renameItem } = await import('./api');
    await renameItem(path, name);
    loadFiles(dir);
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
    // Download each file individually (browsers don't support multi-file download natively)
    const paths = Array.from(selected);
    paths.forEach((path, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = getFileUrl(path) + '&download=1';
        a.download = path.split('/').pop() || 'file';
        a.click();
      }, i * 300); // Stagger downloads to avoid browser blocking
    });
  };

  // Create folder
  const handleCreateFolder = async (name: string) => {
    const folderPath = dir ? `${dir}/${name}` : name;
    await mkdir(folderPath);
    setShowCreateFolder(false);
    loadFiles(dir);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Header
        dir={dir}
        layout={layout}
        theme={theme}
        search={search}
        user={user}
        sidebarOpen={sidebarOpen}
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
      />
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
          <div className="mb-3">
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
                  selected={selected}
                  onSelect={handleSelect}
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
                selected={selected}
                onSelect={handleSelect}
              />
            ) : (
              <FileList
                files={filteredFiles}
                dirs={dirs}
                currentDir={dir}
                onNavigate={navigate}
                onOpen={openLightbox}
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
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
        />
      )}

      {lightbox && mediaItems.length > 0 && (
        <Lightbox
          items={mediaItems}
          index={lightbox.index}
          onClose={handleLightboxClose}
          onNavigate={handleLightboxNavigate}
        />
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
        <KeyboardShortcuts onClose={() => setShowShortcuts(false)} />
      )}
      {showCreateFolder && (
        <CreateFolder
          currentDir={dir}
          onConfirm={handleCreateFolder}
          onClose={() => setShowCreateFolder(false)}
        />
      )}
    </div>
  );
}
