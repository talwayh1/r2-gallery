import { useState, useEffect, useCallback, useRef, lazy, Suspense, useMemo } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import type { FileItem, LayoutMode, SortMode } from './types';
import type { UploadDropzoneHandle } from './components/UploadDropzone';
import { useAuth } from './hooks/useAuth';
import { useTheme } from './hooks/useTheme';
import { toast } from './hooks/useToast';
import { useConfirm } from './hooks/useConfirm';
import { useDebounce } from './hooks/useDebounce';
import { listFiles, telegramLogin, getConfig, setCdnDomain, mkdir, getFileUrl, deleteItems, restoreTrash, renameItem, downloadZip, createFile, createUrlShortcut, moveItem, copyFile, duplicateFile, createZip } from './api';
import type { ListFilesParams } from './api';
import { UploadQueueProvider, useUploadQueue } from './hooks/useUploadQueue';
import { formatSize, formatDate } from './utils';

// Lazy-load heavy components — reduces first-paint JS from ~580KB to ~300KB
const Header = lazy(() => import('./components/Header'));
const Sidebar = lazy(() => import('./components/Sidebar'));
const FileGrid = lazy(() => import('./components/FileGrid'));
const FileList = lazy(() => import('./components/FileList'));
const FileBlocks = lazy(() => import('./components/FileBlocks'));
const FileColumns = lazy(() => import('./components/FileColumns'));
const FileImageList = lazy(() => import('./components/FileImageList'));
const UploadDropzone = lazy(() => import('./components/UploadDropzone'));
const UploadPanel = lazy(() => import('./components/UploadPanel'));
const Login = lazy(() => import('./components/Login'));
const BulkActions = lazy(() => import('./components/BulkActions'));
const CreateFolder = lazy(() => import('./components/CreateFolder'));
const MoveToFolder = lazy(() => import('./components/MoveToFolder'));
const InstallPrompt = lazy(() => import('./components/InstallPrompt'));

// TypeFilter: static import (matchFilter used in useMemo, component small enough to keep in main chunk)
import TypeFilter, { matchFilter } from './components/TypeFilter';
import type { TypeFilter as TypeFilterKind } from './components/TypeFilter';
import SkeletonGrid from './components/SkeletonGrid';
import ScrollToTop from './components/ScrollToTop';
import EmptyState from './components/EmptyState';

// Lazy-loaded components (not needed for first paint)
const Lightbox = lazy(() => import('./components/Lightbox'));
const KeyboardShortcuts = lazy(() => import('./components/KeyboardShortcuts'));
const SearchOverlay = lazy(() => import('./components/SearchOverlay'));
const DiscoverPage = lazy(() => import('./components/DiscoverPage'));
const MemoriesPage = lazy(() => import('./components/MemoriesPage'));
const BatchRename = lazy(() => import('./components/BatchRename'));
const StatsPanel = lazy(() => import('./components/StatsPanel'));
const SettingsPanel = lazy(() => import('./components/SettingsPanel'));
const TrashPage = lazy(() => import('./components/TrashPage'));
const ActivityPage = lazy(() => import('./components/ActivityPage'));

const LazyLoading = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
  </div>
);

export default function App() {
  const { user, loading: authLoading, login, logout } = useAuth();
  const { mode: theme, toggle: toggleTheme } = useTheme();
  const confirm = useConfirm();
  const [dir, setDir] = useState('');
  const [files, setFiles] = useState<Record<string, FileItem>>({});
  const [dirs, setDirs] = useState<string[]>([]);
  const [dirCounts, setDirCounts] = useState<Record<string, number>>({});
  const [dirMtimes, setDirMtimes] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>(() => {
    return (localStorage.getItem('layout') as LayoutMode) || 'blocks';
  });
  const [lightbox, setLightbox] = useState<{ index: number } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('sidebarOpen');
    if (saved !== null) return saved === 'true';
    return window.innerWidth >= 768;
  });
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 200);
  const [showLogin, setShowLogin] = useState(false);
  const [telegramBotUsername, setTelegramBotUsername] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // New features state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<TypeFilterKind>('all');
  const [sortBy, setSortBy] = useState<SortMode>(() => {
    return (localStorage.getItem('sortBy') as SortMode) || 'name';
  });
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(() => {
    return (localStorage.getItem('sortOrder') as 'asc' | 'desc') || 'asc';
  });
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showBatchRename, setShowBatchRename] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [showMemories, setShowMemories] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);

  // Track pending /view/* deep link
  const pendingViewRef = useRef<string | null>(null);
  const initialDirSetRef = useRef(false);
  const uploadDropzoneRef = useRef<UploadDropzoneHandle>(null);
  const sidebarTouchXRef = useRef<number>(0);
  const sidebarTouchActiveRef = useRef<boolean>(false);
  // Abort controller for cancelling stale in-flight requests
  const abortRef = useRef<AbortController | null>(null);
  // Ref-based cursor avoids stale closure in loadFiles when append-loading
  const cursorRef = useRef<string | undefined>(undefined);
  // Ref to track whether we pushed a history entry for the lightbox (browser back support)
  const lightboxHistoryPushedRef = useRef(false);
  // Refs for mobile sidebar edge swipe gesture (swipe right from left edge to open)
  const edgeSwipeStartXRef = useRef<number | null>(null);
  const edgeSwipeStartTimeRef = useRef<number>(0);
  // Ref for main scroll container — wired to ScrollToTop so the "back to top" button works on mobile
  const mainRef = useRef<HTMLElement>(null);

  const loadFiles = useCallback(async (d: string, append = false) => {
    // Cancel any pending request — prevents stale response from overwriting
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params: ListFilesParams = { sort: sortBy, order: sortOrder, type: typeFilter };
      // Use cursorRef to avoid stale closure — ref always has latest value
      const cur = cursorRef.current;
      if (append && cur) {
        params.cursor = cur;
        params.limit = 100;
      }
      const data = await listFiles(d, params, controller.signal);
      if (controller.signal.aborted) return;
      if (append) {
        setFiles(prev => ({ ...prev, ...(data.files || {}) }));
      } else {
        setFiles(data.files || {});
      }
      setDirs(data.dirs || []);
      setDirCounts(data.dirCounts || {});
      setDirMtimes(data.dirMtimes || {});
      setHasMore(data.hasMore || false);
      setCursor(data.cursor);
      cursorRef.current = data.cursor;
    } catch (e) {
      // AbortError is expected on navigation — don't log
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.error('Failed to load files:', e);
      const msg = (e as Error).message || '加载文件失败';
      // Only show toast for non-Abort errors — AbortError is handled above
      toast('error', `加载文件失败: ${msg}`);
    } finally {
      if (controller === abortRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [sortBy, sortOrder, typeFilter]);

  // Handle /view/* deep links and ?view= query param on mount
  useEffect(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');

    // CDN domain: redirect SPA routes to main domain
    if (window.location.hostname === 'lz.zhangyubi.cn') {
      if (path.startsWith('/dir/') || path.startsWith('/view/')) {
        window.location.href = `https://tu.zhangyubi.cn${path}`;
        return;
      }
    }

    // Support ?view=filePath query param (from /view/* redirect)
    if (viewParam) {
      const filePath = decodeURIComponent(viewParam);
      if (filePath) {
        pendingViewRef.current = filePath;
        const parts = filePath.split('/');
        parts.pop();
        const parentDir = parts.join('/');
        setDir(parentDir);
        initialDirSetRef.current = true;
        // Clean up URL
        window.history.replaceState(null, '', parentDir ? `/dir/${encodeURIComponent(parentDir)}` : '/');
      }
      return;
    }

    // Support /view/* path (direct access)
    if (path.startsWith('/view/')) {
      const filePath = decodeURIComponent(path.slice(6));
      if (filePath) {
        pendingViewRef.current = filePath;
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
    cursorRef.current = undefined;
    setHasMore(false);
    loadFiles(dir);
  }, [dir, sortBy, sortOrder, typeFilter]);

  // Clear selection and type filter when directory changes
  useEffect(() => {
    setSelected(new Set());
    // Don't reset typeFilter on dir change - keep user preference
  }, [dir]);

  // Fetch public config (Telegram bot username, hide login button, CDN domain)
  const [hideLoginButton, setHideLoginButton] = useState(false);
  useEffect(() => {
    getConfig().then((data) => {
      if (data.telegramBotUsername) setTelegramBotUsername(data.telegramBotUsername);
      if (data.hideLoginButton) setHideLoginButton(true);
      if (data.cdnDomain) setCdnDomain(data.cdnDomain);
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

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('sidebarOpen', String(sidebarOpen));
  }, [sidebarOpen]);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (isMobile && sidebarOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prevOverflow; };
    }
  }, [isMobile, sidebarOpen]);

  // Update page title based on current directory
  useEffect(() => {
    const dirName = dir ? dir.split('/').pop() || dir : '';
    const fileCount = Object.keys(files).length;
    const title = dir
      ? `${dirName} - R2 Gallery`
      : 'R2 Gallery';
    document.title = title;
  }, [dir, files]);

  // Cleanup: abort any in-flight request on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Auto-refresh (configurable interval, 0 = disabled)
  useEffect(() => {
    const intervalStr = localStorage.getItem('refreshInterval');
    const interval = intervalStr ? parseInt(intervalStr, 10) : 0;
    if (interval <= 0) return;

    const timer = setInterval(() => {
      loadFiles(dir);
    }, interval * 1000);

    return () => clearInterval(timer);
  }, [dir, loadFiles]);

  // Auto-refresh when page becomes visible again (e.g. user returns from another tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadFiles(dir);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [dir, loadFiles]);

  // Load custom CSS from settings
  useEffect(() => {
    const customCss = localStorage.getItem('customCss');
    if (!customCss) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'custom-css';
    styleEl.textContent = customCss;
    document.head.appendChild(styleEl);

    return () => {
      const existing = document.getElementById('custom-css');
      if (existing) existing.remove();
    };
  }, []);

  // Clipboard state for copy/cut/paste
  const clipboardRef = useRef<{ paths: string[]; mode: 'copy' | 'cut' } | null>(null);

  // Apply type filter + search filter (defined early for keyboard shortcuts)
  const filteredFiles = useMemo(() =>
    Object.fromEntries(
      Object.entries(files).filter(([name, f]) => {
        if (debouncedSearch && !name.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
        if (typeFilter !== 'all' && !matchFilter(f.mime, typeFilter)) return false;
        return true;
      })
    ),
    [files, debouncedSearch, typeFilter]
  );

  // Compute summary stats from visible files and directories
  const summaryStats = useMemo(() => {
    const filesList = Object.values(filteredFiles);
    const fileCount = filesList.length;
    const totalSize = filesList.reduce((sum, f) => sum + (f.size || 0), 0);
    return { fileCount, totalSize, dirCount: dirs.length };
  }, [filteredFiles, dirs]);

  // Global keyboard shortcuts (non-lightbox)
  useEffect(() => {
    if (lightbox) return; // Lightbox has its own handler

    const handleKey = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || (e.target as HTMLElement).isContentEditable) return;

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setShowShortcuts((s) => !s);
      } else if (e.key === '/' && !e.shiftKey) {
        e.preventDefault();
        // Focus inline search filter input by placeholder attribute
        const input = document.querySelector<HTMLInputElement>('input[placeholder*="过滤器"]');
        if (input) {
          input.focus();
          input.select();
        } else {
          setShowSearch(true);
        }
      } else if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowSearch(true);
      } else if ((e.key === 'f' || e.key === 'F') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>('input[placeholder*="过滤器"]');
        if (input) {
          input.focus();
          input.select();
        } else {
          setShowSearch(true);
        }
      } else if (e.key === 'r' || e.key === 'R') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          loadFiles(dir);
        }
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        const layouts: LayoutMode[] = ['grid', 'list', 'imagelist', 'columns', 'blocks', 'rows'];
        const labels: Record<LayoutMode, string> = { grid: '网格', list: '列表', imagelist: '图片列表', columns: '列', blocks: '块', rows: '行' };
        const idx = layouts.indexOf(layout);
        const next = layouts[(idx + 1) % layouts.length];
        setLayout(next);
        localStorage.setItem('layout', next);
        toast('info', `布局: ${labels[next]}`);
      } else if (e.key >= '1' && e.key <= '6') {
        e.preventDefault();
        const layoutMap: LayoutMode[] = ['grid', 'list', 'imagelist', 'columns', 'blocks', 'rows'];
        const labels: Record<LayoutMode, string> = { grid: '网格', list: '列表', imagelist: '图片列表', columns: '列', blocks: '块', rows: '行' };
        const idx = parseInt(e.key) - 1;
        const newLayout = layoutMap[idx];
        if (newLayout && newLayout !== layout) {
          setLayout(newLayout);
          localStorage.setItem('layout', newLayout);
          toast('info', `布局: ${labels[newLayout]}`);
        }
      } else if (e.key === 't' || e.key === 'T') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          toggleTheme();
        }
      } else if (e.key === 'b' || e.key === 'B') {
        // B — toggle sidebar
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          setSidebarOpen((prev) => !prev);
        }
      } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        // Ctrl+A — select all files (prevent browser default)
        e.preventDefault();
        const filteredKeys = Object.keys(filteredFiles);
        setSelected(new Set(filteredKeys));
      } else if (e.key === 'Escape') {
        if (selected.size > 0) {
          e.preventDefault();
          setSelected(new Set());
        } else if (search) {
          e.preventDefault();
          setSearch('');
        } else if (showStats) {
          e.preventDefault();
          setShowStats(false);
        } else if (showSettings) {
          e.preventDefault();
          setShowSettings(false);
        } else if (showTrash) {
          e.preventDefault();
          setShowTrash(false);
        } else if (showActivity) {
          e.preventDefault();
          setShowActivity(false);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Delete — delete selected files
        if (selected.size > 0 && user) {
          e.preventDefault();
          handleBatchDelete();
        }
      } else if (e.key === 'F2') {
        // F2 — rename first selected file
        if (selected.size === 1 && user) {
          e.preventDefault();
          const path = Array.from(selected)[0];
          const name = path.split('/').pop() || path;
          const newName = prompt('重命名:', name);
          if (newName && newName !== name) {
            handleRename(path, newName);
          }
        }
      } else if (e.key === 'c' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        // Ctrl+Shift+C — copy selected file links
        if (selected.size > 0) {
          e.preventDefault();
          handleBatchCopyLinks();
        }
      } else if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
        // Ctrl+C — copy selected files
        if (selected.size > 0) {
          e.preventDefault();
          clipboardRef.current = { paths: Array.from(selected), mode: 'copy' };
          toast('info', `已复制 ${selected.size} 个项目`);
        }
      } else if (e.key === 'x' && (e.ctrlKey || e.metaKey)) {
        // Ctrl+X — cut selected files
        if (selected.size > 0 && user) {
          e.preventDefault();
          clipboardRef.current = { paths: Array.from(selected), mode: 'cut' };
          toast('info', `已剪切 ${selected.size} 个项目`);
        }
      } else if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
        // Ctrl+V — paste from clipboard
        if (clipboardRef.current && user) {
          e.preventDefault();
          const { paths, mode } = clipboardRef.current;
          (async () => {
            const results = await Promise.allSettled(
              paths.map(path =>
                mode === 'cut'
                  ? moveItem(path, dir || '')
                  : copyFile(path, dir || '')
              )
            );
            const failed = results.filter(r => r.status === 'rejected').length;
            if (failed === 0) {
              toast('success', `已粘贴 ${paths.length} 个项目`);
            } else {
              toast('info', `已粘贴 ${paths.length - failed} / ${paths.length} 个项目（${failed} 个失败）`);
              // Log individual failures
              results.forEach((r, i) => {
                if (r.status === 'rejected') {
                  console.error(`Paste failed for "${paths[i]}":`, r.reason);
                }
              });
            }
            if (mode === 'cut') clipboardRef.current = null;
            loadFiles(dir);
          })();
        }
      } else if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        // Ctrl+D — duplicate first selected file
        if (selected.size === 1 && user) {
          e.preventDefault();
          const path = Array.from(selected)[0];
          (async () => {
            try {
              const result = await duplicateFile(path);
              if (result.success) {
                toast('success', `已复制到 ${result.newPath}`);
                loadFiles(dir);
              }
            } catch (err) {
              toast('error', `复制失败: ${(err as Error).message}`);
            }
          })();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [lightbox, dir, layout, loadFiles, toggleTheme, selected.size, files, user, filteredFiles, setSidebarOpen]);

  // Scroll position restoration
  const scrollPositions = useRef<Map<string, number>>(new Map());

  const navigate = useCallback((path: string, replace = false) => {
    // Save current scroll position
    const mainEl = document.querySelector('main');
    if (mainEl && dir) {
      scrollPositions.current.set(dir, mainEl.scrollTop);
    }

    setDir(path);
    setSearch('');
    if (isMobile) setSidebarOpen(false);

    // Update URL for deep linking
    const url = path ? `/dir/${encodeURIComponent(path)}` : '/';
    if (window.location.pathname.startsWith('/view/')) {
      window.history.replaceState(null, '', url);
    } else if (replace) {
      window.history.replaceState(null, '', url);
    } else {
      window.history.pushState(null, '', url);
    }
  }, [isMobile, dir]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      // Save current scroll position before navigating away (browser back/forward)
      const mainEl = document.querySelector('main');
      if (mainEl && dir) {
        scrollPositions.current.set(dir, mainEl.scrollTop);
      }
      if (path.startsWith('/dir/')) {
        const dirPath = decodeURIComponent(path.slice(5));
        setDir(dirPath);
      } else if (path === '/') {
        setDir('');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [dir]); // dir dependency ensures we always save the latest scroll position

  // Restore scroll position whenever directory changes (navigate, popstate, initial load)
  useEffect(() => {
    requestAnimationFrame(() => {
      const mainEl = document.querySelector('main');
      const saved = scrollPositions.current.get(dir);
      if (mainEl) {
        mainEl.scrollTop = saved !== undefined ? saved : 0;
      }
    });
  }, [dir]);

  // Restore directory from URL on mount
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/dir/')) {
      const dirPath = decodeURIComponent(path.slice(5));
      setDir(dirPath);
    }
  }, []);

  // Render layout based on current layout mode
  const renderLayout = (files: Record<string, FileItem>, dirs: string[], selected: Set<string>) => {
    const commonProps = {
      files,
      dirs,
      dirCounts,
      dirMtimes,
      currentDir: dir,
      sortBy,
      sortOrder,
      search: debouncedSearch,
      onNavigate: navigate,
      onOpen: openLightbox,
      onDelete: handleDelete,
      onRename: handleRename,
      selected,
      onSelect: handleSelect,
      onLoadMore: loadMore,
      hasMore,
      loadingMore,
    };

    switch (layout) {
      case 'grid':
      case 'rows':
        return (
          <FileGrid
            key={layout}
            {...commonProps}
            onMove={() => loadFiles(dir)}
          />
        );
      case 'list':
        return <FileList key={layout} {...commonProps} />;
      case 'blocks':
        return <FileBlocks key={layout} {...commonProps} />;
      case 'columns':
        return <FileColumns key={layout} {...commonProps} />;
      case 'imagelist':
        return <FileImageList key={layout} {...commonProps} />;
      default:
        return (
          <FileGrid
            key={layout}
            {...commonProps}
            onMove={() => loadFiles(dir)}
          />
        );
    }
  };

  // Build media items list for lightbox navigation
  const isLightboxMime = (mime: string, name: string): boolean => {
    if (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/')) return true;
    if (mime === 'application/pdf') return true;
    if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml' || mime === 'application/javascript') return true;
    if (mime.includes('word') || mime.includes('document') || mime.includes('sheet') || mime.includes('excel') || mime.includes('presentation') || mime.includes('powerpoint')) return true;
    if (name?.endsWith('.url')) return true;
    return false;
  };
  const mediaItems = Object.entries(filteredFiles)
    .filter(([, f]) => isLightboxMime(f.mime, f.name))
    .map(([, f]) => ({ path: f.path, mime: f.mime, size: f.size }));

  // Dynamic page title — update document.title based on current directory and lightbox file
  useEffect(() => {
    let title = 'R2 Gallery';
    const currentFile = lightbox && mediaItems[lightbox.index];
    if (currentFile) {
      // Show file name when lightbox is open
      const name = currentFile.path.split('/').pop() || '';
      title = `${name} - R2 Gallery`;
    } else if (dir) {
      // Show current directory name (last segment)
      const dirName = dir.split('/').filter(Boolean).pop() || dir;
      title = `${dirName} - R2 Gallery`;
    }
    document.title = title;
  }, [dir, lightbox, mediaItems]);

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
    // Push history state so browser back button closes the lightbox
    if (!window.location.pathname.startsWith('/view/')) {
      window.history.pushState({ lightbox: true }, '');
      lightboxHistoryPushedRef.current = true;
    }
    window.history.replaceState({ lightbox: true }, '', `/view/${encodeURIComponent(path)}`);
  }, [mediaItems]);

  const handleLightboxNavigate = useCallback((newIndex: number) => {
    setLightbox({ index: newIndex });
    const newPath = mediaItems[newIndex]?.path;
    if (newPath) {
      window.history.replaceState({ lightbox: true }, '', `/view/${encodeURIComponent(newPath)}`);
    }
  }, [mediaItems]);

  // Popstate handler: browser back button closes the lightbox instead of navigating away
  useEffect(() => {
    const handlePopState = () => {
      if (lightbox !== null) {
        lightboxHistoryPushedRef.current = false;
        setLightbox(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [lightbox]);

  const handleLightboxClose = useCallback(() => {
    setLightbox(null);
    if (lightboxHistoryPushedRef.current) {
      lightboxHistoryPushedRef.current = false;
      window.history.back();
    } else if (window.location.pathname.startsWith('/view/')) {
      window.history.replaceState(null, '', '/');
    }
  }, []);

  const handleLightboxDelete = async (path: string) => {
    try {
      await deleteItems([path]);
      toast('success', `已删除 1 个项目`, 6000, {
        label: '撤销',
        onClick: async () => {
          try {
            await restoreTrash([path]);
            toast('success', '已恢复删除的项目');
            loadFiles(dir);
          } catch (e) {
            toast('error', `恢复失败: ${(e as Error).message}`);
          }
        },
      });
      loadFiles(dir);
      // Close lightbox — the current file is gone
      setLightbox(null);
    } catch (e) {
      toast('error', `删除失败: ${(e as Error).message}`);
    }
  };

  const handleLightboxDuplicate = async (path: string) => {
    try {
      const result = await duplicateFile(path);
      if (result.success) {
        toast('success', '已复制文件');
        loadFiles(dir);
      } else {
        toast('error', '复制失败');
      }
    } catch (e) {
      toast('error', `复制失败: ${(e as Error).message}`);
    }
  };

  const handleDelete = async (paths: string[]) => {
    const names = paths.map(p => p.split('/').pop() || p).join(', ');
    const confirmed = await confirm({
      title: `确认删除 ${paths.length} 个项目？`,
      message: names,
      confirmLabel: '删除',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteItems(paths);
      // Show toast with undo button (longer duration)
      toast('success', `已删除 ${paths.length} 个项目`, 6000, {
        label: '撤销',
        onClick: async () => {
          try {
            await restoreTrash(paths);
            toast('success', '已恢复删除的项目');
            loadFiles(dir);
          } catch (e) {
            toast('error', `恢复失败: ${(e as Error).message}`);
          }
        },
      });
      loadFiles(dir);
    } catch (e) {
      toast('error', `删除失败: ${(e as Error).message}`);
    }
  };

  const handleRename = async (path: string, name: string) => {
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
    // Check download_mode setting — if 'zip', use ZIP download instead
    const downloadMode = localStorage.getItem('download_mode') || 'browser';
    if (downloadMode === 'zip') {
      const paths = Array.from(selected);
      toast('info', `正在打包 ${paths.length} 个文件...`);
      downloadZip(paths).then(() => {
        toast('success', 'ZIP 下载已开始');
      }).catch((e) => {
        toast('error', `ZIP 打包失败: ${(e as Error).message}`);
      });
      return;
    }
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

  const handleBatchDownloadZip = async () => {
    if (selected.size === 0) return;
    const paths = Array.from(selected);
    toast('info', `正在打包 ${paths.length} 个文件...`);
    try {
      await downloadZip(paths);
      toast('success', 'ZIP 下载已开始');
    } catch (e) {
      toast('error', `ZIP 打包失败: ${(e as Error).message}`);
    }
  };

  const handleBatchCreateZip = async () => {
    if (selected.size === 0) return;
    const paths = Array.from(selected);
    toast('info', `正在压缩 ${paths.length} 个文件...`);
    try {
      const result = await createZip(paths, dir);
      toast('success', `已创建 ZIP: ${result.path}`);
      setSelected(new Set());
      loadFiles(dir);
    } catch (e) {
      toast('error', `压缩失败: ${(e as Error).message}`);
    }
  };

  const handleBatchCopyLinks = async (separator?: string) => {
    if (selected.size === 0) return;
    const paths = Array.from(selected);
    const sep = separator || localStorage.getItem('copyLinksSeparator') || '\n';
    const links = paths.map(p => `${window.location.origin}/view/${encodeURIComponent(p)}`).join(sep);
    try {
      await navigator.clipboard.writeText(links);
      toast('success', `已复制 ${paths.length} 个链接`);
    } catch {
      toast('error', '复制失败');
    }
  };

  const handleBatchCopyDirectLinks = async (separator?: string) => {
    if (selected.size === 0) return;
    const paths = Array.from(selected);
    const sep = separator || localStorage.getItem('copyLinksSeparator') || '\n';
    const links = paths.map(p => `${window.location.origin}/api/file?path=${encodeURIComponent(p)}`).join(sep);
    try {
      await navigator.clipboard.writeText(links);
      toast('success', `已复制 ${paths.length} 个直链`);
    } catch {
      toast('error', '复制失败');
    }
  };

  // Bulk copy (Ctrl+C equivalent)
  const handleCopy = useCallback(() => {
    if (selected.size === 0) return;
    clipboardRef.current = { paths: Array.from(selected), mode: 'copy' };
    toast('info', `已复制 ${selected.size} 个项目`);
  }, [selected]);

  // Bulk duplicate — parallel with Promise.allSettled
  const handleDuplicate = useCallback(async () => {
    if (selected.size === 0 || !user) return;
    const paths = Array.from(selected);
    if (paths.length === 0) return;
    toast('info', `正在并行复制 ${paths.length} 个项目...`);
    let success = 0;
    let firstError = '';
    const results = await Promise.allSettled(paths.map(async (path) => {
      const result = await duplicateFile(path);
      if (result.success) success++;
      return result;
    }));
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const msg = (r.reason as Error)?.message || '未知错误';
        if (!firstError) {
          firstError = msg;
          toast('error', `复制失败: ${msg}`, 4000);
        }
      }
    });
    const failed = paths.length - success;
    if (failed > 0) {
      toast('warning', `已复制 ${success}/${paths.length} 个项目，${failed} 个失败`);
    } else {
      toast('success', `已复制 ${success}/${paths.length} 个项目`);
    }
    setSelected(new Set());
    loadFiles(dir);
  }, [selected, user, dir, loadFiles]);

  // Move to folder
  const handleMoveToFolder = useCallback(() => {
    if (selected.size === 0 || !user) return;
    setShowMoveDialog(true);
  }, [selected, user]);

  const handleMoveConfirm = useCallback(async (targetDir: string) => {
    if (selected.size === 0) return;
    const paths = Array.from(selected);
    setShowMoveDialog(false);
    toast('info', `正在并行移动 ${paths.length} 个项目...`);
    let success = 0;
    let firstError = '';
    const results = await Promise.allSettled(paths.map(async (path) => {
      await moveItem(path, targetDir);
      success++;
    }));
    results.forEach((r) => {
      if (r.status === 'rejected') {
        const msg = (r.reason as Error)?.message || '未知错误';
        if (!firstError) {
          firstError = msg;
          toast('error', `移动失败: ${msg}`, 4000);
        }
      }
    });
    const failed = paths.length - success;
    if (failed > 0) {
      toast('warning', `已移动 ${success}/${paths.length} 个项目，${failed} 个失败`);
    } else {
      toast('success', `已移动 ${success}/${paths.length} 个项目到目标文件夹`);
    }
    setSelected(new Set());
    loadFiles(dir);
  }, [selected, dir, loadFiles]);

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
    <UploadQueueProvider>
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Top loading bar — appears during file load operations */}
      {loading && (
        <div className="fixed top-0 left-0 w-full h-0.5 z-[9999] overflow-hidden">
          <div className="w-full h-full bg-blue-500 animate-loading-bar" />
        </div>
      )}
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
        fileCount={Object.keys(files).length}
        dirCount={dirs.length}
        onNavigate={navigate}
        onLayoutChange={(l) => {
          const labels: Record<string, string> = { grid: '网格', list: '列表', imagelist: '图片列表', columns: '列', blocks: '块', rows: '行' };
          setLayout(l);
          localStorage.setItem('layout', l);
          if (l !== layout) toast('info', `布局: ${labels[l] || l}`);
        }}
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
        onMemoriesClick={() => setShowMemories(true)}
        onStatsClick={user ? () => setShowStats(true) : undefined}
        onSettingsClick={user ? () => setShowSettings(true) : undefined}
        onTrashClick={user ? () => setShowTrash(true) : undefined}
        onActivityClick={user ? () => setShowActivity(true) : undefined}
        onSortChange={(sort: SortMode, order: 'asc' | 'desc') => {
          setSortBy(sort);
          setSortOrder(order);
          localStorage.setItem('sortBy', sort);
          localStorage.setItem('sortOrder', order);
        }}
        onTypeFilterChange={(t) => setTypeFilter(t as TypeFilterKind)}
        hideLoginButton={hideLoginButton}
        selectMode={selectMode}
        onSelectModeToggle={() => setSelectMode(!selectMode)}
        scrollRef={mainRef}
      />
      <InstallPrompt />
      <div
        className="flex flex-1 overflow-hidden relative touch-pan-y"
        onTouchStart={(e) => {
          if (!isMobile || sidebarOpen) return;
          const touchX = e.touches[0].clientX;
          // Only react to swipes starting from the left edge (within 30px)
          if (touchX < 30) {
            edgeSwipeStartXRef.current = touchX;
            edgeSwipeStartTimeRef.current = Date.now();
          }
        }}
        onTouchMove={(e) => {
          if (!isMobile || sidebarOpen || edgeSwipeStartXRef.current === null) return;
          const dx = e.touches[0].clientX - edgeSwipeStartXRef.current;
          const dt = Date.now() - edgeSwipeStartTimeRef.current;
          // Quick swipe right (60px+ within 300ms) from left edge opens sidebar
          if (dx > 60 && dt < 350) {
            edgeSwipeStartXRef.current = null;
            setSidebarOpen(true);
          }
        }}
        onTouchEnd={() => {
          edgeSwipeStartXRef.current = null;
        }}
      >
        {/* Mobile sidebar overlay — always rendered for fade-out animation */}
        {isMobile && (
          <div
            className={`fixed inset-0 z-30 bg-black/40 backdrop-blur-sm top-14 transition-opacity duration-300 ${
              sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            onClick={() => setSidebarOpen(false)}
            onTouchStart={() => {}}
          />
        )}
        {/* Sidebar */}
        <div
          onTouchStart={(e) => {
            sidebarTouchXRef.current = e.touches[0].clientX;
            sidebarTouchActiveRef.current = true;
          }}
          onTouchMove={(e) => {
            if (!sidebarTouchActiveRef.current) return;
            const dx = sidebarTouchXRef.current - e.touches[0].clientX;
            // Swipe left 80px+ to close sidebar
            if (dx > 80) {
              sidebarTouchActiveRef.current = false;
              setSidebarOpen(false);
            }
          }}
          onTouchEnd={() => {
            sidebarTouchActiveRef.current = false;
          }}
          className={`${isMobile
            ? `fixed left-0 top-14 bottom-0 z-40 shadow-xl transition-transform duration-300 ease-out ${
                sidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }`
            : `transition-transform duration-300 ${sidebarOpen ? 'block' : 'hidden'}`
          }`}
        >
          <Sidebar currentDir={dir} onNavigate={navigate} onClose={isMobile ? () => setSidebarOpen(false) : undefined} dirCounts={dirCounts} />
        </div>
        {/* Main content */}
        <main ref={mainRef} className={`flex-1 overflow-auto ${isMobile ? 'p-2' : 'p-4'}`} style={{ contain: 'layout style paint' }}>
          {/* Type filter bar - mobile: horizontal scroll, desktop: normal */}
          <div className={`mb-3 ${isMobile ? 'overflow-x-auto scrollbar-none -mx-2 px-2' : 'hidden sm:block'}`}>
            <TypeFilter
              files={files}
              active={typeFilter}
              onChange={setTypeFilter}
            />
          </div>

          {loading && !loadingMore ? (
            <div className="py-4">
              <SkeletonGrid layoutMode={layout} />
            </div>
          ) : Object.keys(filteredFiles).length === 0 && dirs.length === 0 ? (
            <EmptyState
              type={search ? 'search' : typeFilter !== 'all' ? 'filtered' : user ? 'upload' : 'directory'}
              user={!!user}
              onClearSearch={search ? () => setSearch('') : undefined}
              onClearFilter={typeFilter !== 'all' ? () => setTypeFilter('all') : undefined}
              onUpload={user ? () => uploadDropzoneRef.current?.openFileDialog() : undefined}
              onNavigate={navigate}
            />
          ) : (
            <ErrorBoundary><Suspense fallback={<LazyLoading />}>
              {user ? (
                <UploadDropzone ref={uploadDropzoneRef} dir={dir} onUpload={() => loadFiles(dir)}>
                  {renderLayout(filteredFiles, dirs, selected)}
                </UploadDropzone>
              ) : (
                renderLayout(filteredFiles, dirs, selected)
              )}
            </Suspense></ErrorBoundary>
          )}

          {/* Summary bar */}
          {!loading && (summaryStats.fileCount > 0 || summaryStats.dirCount > 0) && selected.size === 0 && (
            <div className="mt-2 px-1 pb-1 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
              <span>{summaryStats.fileCount} 个文件</span>
              {summaryStats.dirCount > 0 && <span>· {summaryStats.dirCount} 个文件夹</span>}
              {summaryStats.totalSize > 0 && <span>· 共 {formatSize(summaryStats.totalSize)}</span>}
              {search && <span className="ml-1 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">搜索: "{search}"</span>}
            </div>
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
          onDownloadZip={handleBatchDownloadZip}
          onCopyLinks={handleBatchCopyLinks}
          onCopyDirectLinks={handleBatchCopyDirectLinks}
          onBatchRename={user ? () => setShowBatchRename(true) : undefined}
          onCreateZip={user ? handleBatchCreateZip : undefined}
          onCopy={user ? handleCopy : undefined}
          onDuplicate={user ? handleDuplicate : undefined}
          onMoveToFolder={user ? handleMoveToFolder : undefined}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
        />
      )}

      {lightbox && mediaItems.length > 0 && (
        <ErrorBoundary><Suspense fallback={<LazyLoading />}>
          <Lightbox
            items={mediaItems}
            index={lightbox.index}
            onClose={handleLightboxClose}
            onNavigate={handleLightboxNavigate}
            onDelete={user ? handleLightboxDelete : undefined}
            onDuplicate={user ? handleLightboxDuplicate : undefined}
          />
        </Suspense></ErrorBoundary>
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
        <ErrorBoundary><Suspense fallback={<LazyLoading />}>
          <KeyboardShortcuts onClose={() => setShowShortcuts(false)} />
        </Suspense></ErrorBoundary>
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
      {showMoveDialog && user && (
        <ErrorBoundary><Suspense fallback={<LazyLoading />}>
          <MoveToFolder
            currentDir={dir}
            onMove={handleMoveConfirm}
            onClose={() => setShowMoveDialog(false)}
          />
        </Suspense></ErrorBoundary>
      )}
      {showSearch && (
        <ErrorBoundary><Suspense fallback={<LazyLoading />}>
          <SearchOverlay
            onClose={() => setShowSearch(false)}
            onNavigate={(d) => { navigate(d); setShowSearch(false); }}
            onOpenFile={(path, mime) => { openLightbox(path, mime); setShowSearch(false); }}
          />
        </Suspense></ErrorBoundary>
      )}
      {showDiscover && (
        <ErrorBoundary><Suspense fallback={<LazyLoading />}>
          <DiscoverPage
            onClose={() => setShowDiscover(false)}
            onNavigate={(d) => { navigate(d); setShowDiscover(false); }}
            onOpenFile={(path, mime) => { openLightbox(path, mime); setShowDiscover(false); }}
          />
        </Suspense></ErrorBoundary>
      )}
      {showMemories && (
        <ErrorBoundary><Suspense fallback={<LazyLoading />}>
          <MemoriesPage
            onClose={() => setShowMemories(false)}
            onNavigate={(d) => { navigate(d); setShowMemories(false); }}
            onOpenFile={(path, mime) => { openLightbox(path, mime); setShowMemories(false); }}
          />
        </Suspense></ErrorBoundary>
      )}
      {showBatchRename && user && (
        <ErrorBoundary><Suspense fallback={<LazyLoading />}>
          <BatchRename
            selectedFiles={Array.from(selected)}
            onDone={() => { setShowBatchRename(false); setSelected(new Set()); loadFiles(dir); }}
            onClose={() => setShowBatchRename(false)}
          />
        </Suspense></ErrorBoundary>
      )}
      {showStats && user && (
        <ErrorBoundary><Suspense fallback={<LazyLoading />}>
          <StatsPanel onClose={() => setShowStats(false)} />
        </Suspense></ErrorBoundary>
      )}
      {showSettings && user && (
        <ErrorBoundary><Suspense fallback={<LazyLoading />}>
          <SettingsPanel onClose={() => setShowSettings(false)} />
        </Suspense></ErrorBoundary>
      )}
      {showTrash && user && (
        <ErrorBoundary><Suspense fallback={<LazyLoading />}>
          <TrashPage onClose={() => setShowTrash(false)} onRestore={() => loadFiles(dir)} />
        </Suspense></ErrorBoundary>
      )}
      {showActivity && user && (
        <ErrorBoundary><Suspense fallback={<LazyLoading />}>
          <ActivityPage onClose={() => setShowActivity(false)} />
        </Suspense></ErrorBoundary>
      )}

      {/* Upload floating button + progress panel */}
      {user && (
        <>
          <UploadFab uploadRef={uploadDropzoneRef} />
          <ErrorBoundary><Suspense fallback={null}>
            <UploadPanel />
          </Suspense></ErrorBoundary>
        </>
      )}

      {/* Floating scroll-to-top button */}
      <ScrollToTop scrollRef={mainRef as React.RefObject<HTMLDivElement | null>} />
    </div>
    </UploadQueueProvider>
  );
}

/** Upload FAB with progress badge — toggles UploadPanel when uploads active */
function UploadFab({ uploadRef }: { uploadRef: React.RefObject<UploadDropzoneHandle | null> }) {
  const { tasks, setOpen, isOpen, hasActiveUploads, activeCount, completedCount, failedCount } = useUploadQueue();

  // Calculate overall progress
  const totalBytes = tasks.reduce((s, t) => s + t.total, 0);
  const loadedBytes = tasks.reduce((s, t) => s + Math.min(t.loaded, t.total), 0);
  const pct = totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0;

  // For completed tasks: 100% each
  const completedPct = tasks.length > 0
    ? Math.round((completedCount / tasks.length) * 100)
    : 0;

  const displayPct = hasActiveUploads ? pct : (completedCount > 0 && failedCount === 0 ? 100 : completedPct);

  const handleClick = () => {
    if (hasActiveUploads || isOpen) {
      setOpen(!isOpen);
    } else {
      uploadRef.current?.openFileDialog();
    }
  };

  // SVG progress ring settings
  const r = 24;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(displayPct, 100) / 100) * circumference;
  const showRing = hasActiveUploads || completedCount > 0;

  return (
    <div className="fixed right-6 z-30" style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
      <button
        onClick={handleClick}
        className="relative w-16 h-16 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
        title={hasActiveUploads ? `上传进度 ${displayPct}%` : (isOpen ? '关闭上传面板' : '上传文件')}
      >
        {showRing ? (
          <>
            {/* Background ring */}
            <svg className="absolute inset-0" viewBox="0 0 56 56" width="56" height="56">
              <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
              <circle
                cx="28" cy="28" r={r}
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className="transition-all duration-300"
                transform="rotate(-90 28 28)"
              />
            </svg>
            {/* Active count badge */}
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 shadow">
                {activeCount > 9 ? '9+' : activeCount}
              </span>
            )}
            {/* Icon */}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        )}
      </button>
    </div>
  );
}
