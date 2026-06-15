import { useState, useEffect, useCallback } from 'react';
import type { FileItem, LayoutMode } from './types';
import { useAuth } from './hooks/useAuth';
import { useTheme } from './hooks/useTheme';
import { listFiles } from './api';
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
  const [lightbox, setLightbox] = useState<{ path: string; mime: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [showLogin, setShowLogin] = useState(false);

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

  // Load files immediately (public access, no login required)
  useEffect(() => {
    loadFiles(dir);
  }, [dir, loadFiles]);

  const navigate = useCallback((path: string) => {
    setDir(path);
    setSearch('');
  }, []);

  const openLightbox = useCallback((path: string, mime: string) => {
    setLightbox({ path, mime });
  }, []);

  const filteredFiles = Object.fromEntries(
    Object.entries(files).filter(([name]) =>
      !search || name.toLowerCase().includes(search.toLowerCase())
    )
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Header
        dir={dir}
        layout={layout}
        theme={theme}
        search={search}
        user={user}
        sidebarOpen={sidebarOpen}
        onLayoutChange={(l) => { setLayout(l); localStorage.setItem('layout', l); }}
        onThemeToggle={toggleTheme}
        onSearchChange={setSearch}
        onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
        onLogout={logout}
        onRefresh={() => loadFiles(dir)}
        onLoginClick={() => setShowLogin(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <Sidebar currentDir={dir} onNavigate={navigate} />
        )}
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
                  onDelete={async (paths) => {
                    const { deleteItems } = await import('./api');
                    await deleteItems(paths);
                    loadFiles(dir);
                  }}
                  onRename={async (path, name) => {
                    const { renameItem } = await import('./api');
                    await renameItem(path, name);
                    loadFiles(dir);
                  }}
                />
              ) : (
                <FileList
                  files={filteredFiles}
                  dirs={dirs}
                  currentDir={dir}
                  onNavigate={navigate}
                  onOpen={openLightbox}
                  onDelete={async (paths) => {
                    const { deleteItems } = await import('./api');
                    await deleteItems(paths);
                    loadFiles(dir);
                  }}
                  onRename={async (path, name) => {
                    const { renameItem } = await import('./api');
                    await renameItem(path, name);
                    loadFiles(dir);
                  }}
                />
              )}
            </UploadZone>
          ) : (
            /* Public view: browse only, no upload/delete/rename */
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
      {lightbox && (
        <Lightbox
          path={lightbox.path}
          mime={lightbox.mime}
          onClose={() => setLightbox(null)}
        />
      )}
      {showLogin && !user && (
        <Login
          onLogin={async (username: string, password: string) => {
            const result = await login(username, password);
            if (result?.token) setShowLogin(false);
            return result;
          }}
          onClose={() => setShowLogin(false)}
        />
      )}
    </div>
  );
}
