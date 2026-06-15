import { useState, useEffect, useCallback } from 'react';
import type { FileItem, LayoutMode } from './types';
import { useAuth } from './hooks/useAuth';
import { useTheme } from './hooks/useTheme';
import { listFiles, telegramLogin, getConfig } from './api';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import FileGrid from './components/FileGrid';
import FileList from './components/FileList';
import Lightbox from './components/Lightbox';
import UploadZone from './components/UploadZone';
import Login from './components/Login';

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

  useEffect(() => {
    loadFiles(dir);
  }, [dir, loadFiles]);

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

  const navigate = useCallback((path: string) => {
    setDir(path);
    setSearch('');
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  const filteredFiles = Object.fromEntries(
    Object.entries(files).filter(([name]) =>
      !search || name.toLowerCase().includes(search.toLowerCase())
    )
  );

  // Build media items list for lightbox navigation
  const mediaItems = Object.entries(filteredFiles)
    .filter(([, f]) => f.mime.startsWith('image/') || f.mime.startsWith('video/') || f.mime.startsWith('audio/'))
    .map(([, f]) => ({ path: f.path, mime: f.mime }));

  const openLightbox = useCallback((path: string, _mime: string) => {
    const idx = mediaItems.findIndex(item => item.path === path);
    setLightbox({ index: idx >= 0 ? idx : 0 });
  }, [mediaItems]);

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
      {lightbox && mediaItems.length > 0 && (
        <Lightbox
          items={mediaItems}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={(newIndex) => setLightbox({ index: newIndex })}
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
              // Reload to pick up the new auth state
              window.location.reload();
            }
            return result;
          }}
          onClose={() => setShowLogin(false)}
        />
      )}
    </div>
  );
}
