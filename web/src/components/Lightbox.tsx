import { useEffect, useCallback, useState, useRef, lazy, Suspense } from 'react';
import { getFileUrl, getThumbUrl, getExif, saveFile, uploadCustomThumb, type ExifData } from '../api';
import VideoPlayer from './VideoPlayer';
import MarkdownEditor from './MarkdownEditor';

// Lazy-load heavy components (hls.js is ~400KB)
const HlsPlayer = lazy(() => import('./HlsPlayer'));
const PanoramaViewer = lazy(() => import('./PanoramaViewer'));
const KeyboardShortcutsLightbox = lazy(() => import('./KeyboardShortcuts'));

interface MediaItem {
  path: string;
  mime: string;
  size?: number;
}

interface Props {
  items: MediaItem[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

/** Touch gesture hook for swipe navigation (only when not zoomed) */
function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  onSwipeDown,
  onSwipeProgress,
  enabled,
}: {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onSwipeDown: () => void;
  onSwipeProgress?: (dy: number) => void;
  enabled: boolean;
}) {
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const swipeDownConfirmed = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (!enabled) return;
      const touch = e.touches[0];
      touchStart.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      swipeDownConfirmed.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!enabled || !touchStart.current) return;
      const touch = e.touches[0];
      const dy = touch.clientY - touchStart.current.y;
      const dt = Date.now() - touchStart.current.time;

      // Only show progress for downward swipes (not left/right navigations)
      if (dy > 0 && dt < 500 && onSwipeProgress) {
        if (dy > 30) swipeDownConfirmed.current = true;
        onSwipeProgress(dy);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!enabled || !touchStart.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;
      const dt = Date.now() - touchStart.current.time;
      touchStart.current = null;

      const minDist = 50;
      const maxDuration = 500;
      if (dt > maxDuration) return;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx > absDy && absDx > minDist) {
        if (dx < 0) onSwipeLeft();
        else onSwipeRight();
      } else if (dy > 0 && (swipeDownConfirmed.current || (absDy > minDist))) {
        // Close if dragged past threshold (30% of viewport height)
        const closeThreshold = Math.min(window.innerHeight * 0.3, 200);
        if (dy >= closeThreshold) {
          onSwipeDown();
        } else {
          // Snap back with animation
          onSwipeProgress?.(0);
          swipeDownConfirmed.current = false;
        }
      } else {
        // Snap back if not a downward swipe or too short
        if (dy > 0) onSwipeProgress?.(0);
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onSwipeLeft, onSwipeRight, onSwipeDown, onSwipeProgress, enabled]);

  return containerRef;
}

function formatSize(bytes: number) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/** Compute a human-readable aspect ratio string */
function getAspectRatio(w: number, h: number): string {
  function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
  }
  const d = gcd(w, h);
  const rw = w / d;
  const rh = h / d;
  const ratio = w / h;
  if (Math.abs(ratio - 16 / 9) < 0.02) return '16:9';
  if (Math.abs(ratio - 4 / 3) < 0.02) return '4:3';
  if (Math.abs(ratio - 3 / 2) < 0.02) return '3:2';
  if (Math.abs(ratio - 1) < 0.02) return '1:1';
  if (Math.abs(ratio - 21 / 9) < 0.02) return '21:9';
  if (Math.abs(ratio - 9 / 16) < 0.02) return '9:16';
  if (rw > 50 || rh > 50) return `${ratio.toFixed(2)}:1`;
  return `${rw}:${rh}`;
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function isTextMime(mime: string): boolean {
  return mime.startsWith('text/') ||
         mime === 'application/json' ||
         mime === 'application/xml' ||
         mime === 'application/javascript' ||
         mime === 'application/x-yaml' ||
         mime === 'application/yaml';
}

export default function Lightbox({ items, index, onClose, onNavigate }: Props) {
  const current = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;
  const [copied, setCopied] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [exifData, setExifData] = useState<ExifData | null>(null);
  const [exifLoading, setExifLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null);
  const [swipeHint, setSwipeHint] = useState<'left' | 'right' | 'down' | null>(null);

  // === Slideshow state ===
  const [slideshowPlaying, setSlideshowPlaying] = useState(false);
  const [slideshowSpeed, setSlideshowSpeed] = useState(3); // seconds
  const [slideshowShuffle, setSlideshowShuffle] = useState(false);
  const [slideshowLoop, setSlideshowLoop] = useState(true);
  const [slideshowProgress, setSlideshowProgress] = useState(0);
  const [showSlideshowMenu, setShowSlideshowMenu] = useState(false);
  const slideshowTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideshowProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playedIndicesRef = useRef<Set<number>>(new Set([index]));

  // === Zoom state ===
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragOffsetStart = useRef({ x: 0, y: 0 });
  const pinchStartDist = useRef(0);
  const pinchStartScale = useRef(1);
  const imgContainerRef = useRef<HTMLDivElement>(null);

  // Audio player state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  // Text content state
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textSaving, setTextSaving] = useState(false);

  // .url file content state
  const [urlContent, setUrlContent] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);

  // Panorama state
  const [showPanorama, setShowPanorama] = useState(false);

  // Keyboard shortcuts help state
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Cursor auto-hide for video (3s idle)
  const [cursorVisible, setCursorVisible] = useState(true);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mobile UI visibility — tap image to toggle controls
  const [uiVisible, setUiVisible] = useState(true);

  // Video poster upload state
  const [posterUploading, setPosterUploading] = useState(false);
  const posterInputRef = useRef<HTMLInputElement>(null);

  // Swipe-to-close drag feedback
  const [swipeDragY, setSwipeDragY] = useState(0);

  const handlePosterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !current) return;
    setPosterUploading(true);
    try {
      await uploadCustomThumb(current.path, file);
      // Force refresh the thumbnail by adding a cache-busting param
      const thumbImgs = document.querySelectorAll(`img[src*="/api/thumb?path=${encodeURIComponent(current.path)}"]`);
      thumbImgs.forEach((img) => {
        (img as HTMLImageElement).src = `/api/thumb?path=${encodeURIComponent(current.path)}&t=${Date.now()}`;
      });
    } catch (err) {
      console.error('Poster upload failed:', err);
    } finally {
      setPosterUploading(false);
      if (posterInputRef.current) posterInputRef.current.value = '';
    }
  };

  const isZoomed = scale > 1.05;

  // Compute derived values
  const url = current ? getFileUrl(current.path) : '';
  const name = current ? (current.path.split('/').pop() || '') : '';
  const ext = name.split('.').pop()?.toUpperCase() || '';
  const viewUrl = `${window.location.origin}/view/${encodeURIComponent(current?.path || '')}`;
  const directUrl = `${window.location.origin}/api/file?path=${encodeURIComponent(current?.path || '')}`;

  // Detect file types
  const isUrlFile = name.endsWith('.url');
  const isHls = name.endsWith('.m3u8') || url.includes('.m3u8');

  // Reset zoom
  const resetZoom = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Zoom to a specific level centered on a point
  const zoomAtPoint = useCallback((clientX: number, clientY: number, newScale: number) => {
    const container = imgContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = clientX - rect.left - rect.width / 2;
    const cy = clientY - rect.top - rect.height / 2;

    setScale((prevScale) => {
      const clampedScale = Math.max(1, Math.min(newScale, 8));
      const ratio = clampedScale / prevScale;
      setOffset((prev) => ({
        x: cx - ratio * (cx - prev.x),
        y: cy - ratio * (cy - prev.y),
      }));
      return clampedScale;
    });
  }, []);

  const goPrev = useCallback(() => {
    if (hasPrev) {
      resetZoom();
      onNavigate(index - 1);
      setSwipeHint('right');
      setTimeout(() => setSwipeHint(null), 300);
    }
  }, [hasPrev, index, onNavigate, resetZoom]);

  const goNext = useCallback(() => {
    if (hasNext) {
      resetZoom();
      onNavigate(index + 1);
      setSwipeHint('left');
      setTimeout(() => setSwipeHint(null), 300);
    }
  }, [hasNext, index, onNavigate, resetZoom]);

  // === Slideshow logic ===
  const getNextSlideshowIndex = useCallback(() => {
    if (slideshowShuffle) {
      // Pick a random unplayed index
      const unplayed: number[] = [];
      for (let i = 0; i < items.length; i++) {
        if (!playedIndicesRef.current.has(i)) unplayed.push(i);
      }
      if (unplayed.length === 0) {
        if (slideshowLoop) {
          playedIndicesRef.current = new Set();
          const all = items.map((_, i) => i).filter(i => i !== index);
          return all.length > 0 ? all[Math.floor(Math.random() * all.length)] : index;
        }
        return -1; // done
      }
      const pick = unplayed[Math.floor(Math.random() * unplayed.length)];
      playedIndicesRef.current.add(pick);
      return pick;
    }
    // Sequential
    if (index < items.length - 1) return index + 1;
    if (slideshowLoop) return 0;
    return -1;
  }, [index, items.length, slideshowShuffle, slideshowLoop]);

  const stopSlideshow = useCallback(() => {
    setSlideshowPlaying(false);
    if (slideshowTimerRef.current) {
      clearInterval(slideshowTimerRef.current);
      slideshowTimerRef.current = null;
    }
    if (slideshowProgressRef.current) {
      clearInterval(slideshowProgressRef.current);
      slideshowProgressRef.current = null;
    }
    setSlideshowProgress(0);
  }, []);

  const startSlideshow = useCallback(() => {
    setSlideshowPlaying(true);
    playedIndicesRef.current = new Set([index]);
    resetZoom();
  }, [index, resetZoom]);

  const toggleSlideshow = useCallback(() => {
    if (slideshowPlaying) stopSlideshow();
    else startSlideshow();
  }, [slideshowPlaying, stopSlideshow, startSlideshow]);

  // Slideshow timer effect
  useEffect(() => {
    if (!slideshowPlaying) return;

    const intervalMs = slideshowSpeed * 1000;
    const progressStep = 50; // update every 50ms
    let elapsed = 0;

    // Progress bar updater
    slideshowProgressRef.current = setInterval(() => {
      elapsed += progressStep;
      setSlideshowProgress((elapsed / intervalMs) * 100);
    }, progressStep);

    // Advance timer
    slideshowTimerRef.current = setTimeout(() => {
      const nextIdx = getNextSlideshowIndex();
      if (nextIdx < 0) {
        stopSlideshow();
      } else {
        resetZoom();
        onNavigate(nextIdx);
        setSlideshowProgress(0);
      }
    }, intervalMs);

    return () => {
      if (slideshowTimerRef.current) {
        clearTimeout(slideshowTimerRef.current);
        slideshowTimerRef.current = null;
      }
      if (slideshowProgressRef.current) {
        clearInterval(slideshowProgressRef.current);
        slideshowProgressRef.current = null;
      }
    };
  }, [slideshowPlaying, slideshowSpeed, index, getNextSlideshowIndex, onNavigate, resetZoom, stopSlideshow]);

  // Stop slideshow at end of non-looping list
  useEffect(() => {
    if (slideshowPlaying && !slideshowLoop && !slideshowShuffle && index >= items.length - 1) {
      // Will stop on next advance attempt
    }
  }, [slideshowPlaying, slideshowLoop, slideshowShuffle, index, items.length]);

  // Reset played indices when shuffle toggled
  useEffect(() => {
    playedIndicesRef.current = new Set([index]);
  }, [slideshowShuffle, index]);

  // Stop slideshow on unmount
  useEffect(() => {
    return () => {
      if (slideshowTimerRef.current) clearTimeout(slideshowTimerRef.current);
      if (slideshowProgressRef.current) clearInterval(slideshowProgressRef.current);
    };
  }, []);

  // Close slideshow settings menu on outside click
  useEffect(() => {
    if (!showSlideshowMenu) return;
    const close = () => setShowSlideshowMenu(false);
    // Delay to avoid immediately closing from the button click
    const timer = setTimeout(() => {
      document.addEventListener('click', close);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', close);
    };
  }, [showSlideshowMenu]);

  // Disable swipe gestures when zoomed
  const handleClose = useCallback(() => {
    setSwipeDragY(0);
    stopSlideshow();
    onClose();
  }, [stopSlideshow, onClose]);

  const swipeRef = useSwipeGesture({
    onSwipeLeft: goNext,
    onSwipeRight: goPrev,
    onSwipeDown: handleClose,
    onSwipeProgress: setSwipeDragY,
    enabled: !isZoomed,
  });

  // === Mouse wheel zoom ===
  useEffect(() => {
    const el = imgContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // Only zoom on images
      if (!current?.mime.startsWith('image/')) return;
      e.preventDefault();

      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      const newScale = scale * (1 + delta);
      zoomAtPoint(e.clientX, e.clientY, newScale);

      // If zoomed back to 1, reset offset
      if (newScale <= 1.05) {
        setTimeout(() => resetZoom(), 50);
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [scale, current, zoomAtPoint, resetZoom]);

  // === Pinch zoom (touch) ===
  useEffect(() => {
    const el = imgContainerRef.current;
    if (!el || !current?.mime.startsWith('image/')) return;

    const getTouchDist = (touches: TouchList) => {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const getTouchCenter = (touches: TouchList) => {
      if (touches.length < 2) return { x: touches[0]?.clientX || 0, y: touches[0]?.clientY || 0 };
      return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2,
      };
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchStartDist.current = getTouchDist(e.touches);
        pinchStartScale.current = scale;
      } else if (e.touches.length === 1 && isZoomed) {
        // Dragging when zoomed
        isDragging.current = true;
        dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        dragOffsetStart.current = { ...offset };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = getTouchDist(e.touches);
        const center = getTouchCenter(e.touches);
        const newScale = pinchStartScale.current * (dist / pinchStartDist.current);
        zoomAtPoint(center.x, center.y, newScale);
      } else if (e.touches.length === 1 && isDragging.current && isZoomed) {
        e.preventDefault();
        const dx = e.touches[0].clientX - dragStart.current.x;
        const dy = e.touches[0].clientY - dragStart.current.y;
        setOffset({
          x: dragOffsetStart.current.x + dx,
          y: dragOffsetStart.current.y + dy,
        });
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      isDragging.current = false;
      if (e.touches.length < 2 && scale <= 1.05) {
        resetZoom();
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [scale, offset, isZoomed, current, zoomAtPoint, resetZoom]);

  // === Preload adjacent images for instant navigation ===
  useEffect(() => {
    if (!current) return;
    const adjacentIndices = [index - 1, index + 1].filter(
      (i) => i >= 0 && i < items.length
    );
    const pendingImgs: HTMLImageElement[] = [];
    for (const i of adjacentIndices) {
      const item = items[i];
      if (item.mime.startsWith('image/')) {
        const img = new Image();
        img.src = getFileUrl(item.path);
        pendingImgs.push(img);
      }
    }
    return () => {
      for (const img of pendingImgs) {
        img.src = '';
      }
    };
  }, [index, items, current]);

  // === Mouse drag when zoomed ===
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isZoomed) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragOffsetStart.current = { ...offset };
    e.preventDefault();
  }, [isZoomed, offset]);

  useEffect(() => {
    if (!isZoomed) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setOffset({
        x: dragOffsetStart.current.x + dx,
        y: dragOffsetStart.current.y + dy,
      });
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isZoomed]);

  // === Double click/tap to toggle zoom, single tap to toggle UI ===
  const lastClickTime = useRef(0);
  const handleImageClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    if (now - lastClickTime.current < 300) {
      // Double click — toggle zoom
      if (isZoomed) {
        resetZoom();
      } else {
        zoomAtPoint(e.clientX, e.clientY, 2.5);
      }
      lastClickTime.current = 0;
    } else {
      // Single click — toggle UI visibility on mobile
      if (isMobile) {
        setUiVisible((v) => !v);
      }
      lastClickTime.current = now;
    }
  }, [isZoomed, isMobile, zoomAtPoint, resetZoom]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs inside the lightbox (e.g. MarkdownEditor)
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        if (isZoomed) {
          resetZoom();
        } else {
          handleClose();
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goPrev(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goNext(); }
      else if (e.key === 'i') setShowInfo((s) => !s);
      else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        setShowKeyboardHelp((s) => !s);
      }
      else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setScale((s) => Math.min(s * 1.3, 8));
      } else if (e.key === '-') {
        e.preventDefault();
        const newScale = scale / 1.3;
        if (newScale <= 1.05) resetZoom();
        else setScale(newScale);
      } else if (e.key === '0') {
        resetZoom();
      } else if (e.key === 'd' || e.key === 'D') {
        if (!isZoomed) {
          e.preventDefault();
          const a = document.createElement('a');
          a.href = url;
          a.download = name;
          a.click();
        }
      } else if (e.key === ' ' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (current?.mime.startsWith('video/')) {
          // Space toggles play/pause when viewing a video
          const videoEl = imgContainerRef.current?.querySelector('video');
          if (videoEl) {
            if (videoEl.paused) videoEl.play().catch(() => {});
            else videoEl.pause();
          }
        } else {
          toggleSlideshow();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose, goPrev, goNext, url, name, isZoomed, scale, resetZoom, toggleSlideshow, current]);

  // Reset state on navigation
  useEffect(() => {
    setCopied(false);
    setShowInfo(false);
    setExifData(null);
    setExifLoading(false);
    setImageLoaded(false);
    setImageDimensions(null);
    resetZoom();
    setSlideshowProgress(0);
    setAudioPlaying(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);
    setTextContent(null);
    setTextLoading(false);
  }, [index, resetZoom]);

  // Fetch EXIF data when info panel is shown for an image
  useEffect(() => {
    if (!showInfo || !current || !current.mime.startsWith('image/')) {
      return;
    }
    let cancelled = false;
    setExifLoading(true);
    setExifData(null);
    getExif(current.path)
      .then((data) => {
        if (!cancelled) {
          setExifData(data.exif);
          setExifLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setExifLoading(false);
      });
    return () => { cancelled = true; };
  }, [showInfo, current]);

  // Fetch text content for text/code files (with size limit)
  useEffect(() => {
    if (!current || !isTextMime(current.mime)) {
      setTextContent(null);
      return;
    }

    // Check file size limit (default 2MB, configurable via localStorage)
    const maxSizeStr = localStorage.getItem('codeMaxLoad');
    const maxSize = maxSizeStr ? parseInt(maxSizeStr, 10) : 2 * 1024 * 1024;
    if (current.size && current.size > maxSize) {
      setTextContent(null);
      setTextLoading(false);
      return;
    }

    let cancelled = false;
    setTextLoading(true);
    setTextContent(null);
    const fileUrl = getFileUrl(current.path);
    fetch(fileUrl)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load');
        return res.text();
      })
      .then((text) => {
        if (!cancelled) {
          setTextContent(text);
          setTextLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTextContent(null);
          setTextLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [current]);

  // Fetch .url file content
  useEffect(() => {
    if (!current || !isUrlFile) {
      setUrlContent(null);
      return;
    }
    let cancelled = false;
    setUrlLoading(true);
    setUrlContent(null);
    fetch(`/api/url-content?path=${encodeURIComponent(current.path)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setUrlContent(data.url || null);
          setUrlLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) { setUrlContent(null); setUrlLoading(false); }
      });
    return () => { cancelled = true; };
  }, [current, isUrlFile]);

  // Preload ±2 adjacent thumbnails for smoother navigation (not full originals)
  useEffect(() => {
    const preloadIndices = [index - 2, index - 1, index + 1, index + 2];
    const preloaded: HTMLImageElement[] = [];
    for (const i of preloadIndices) {
      if (i >= 0 && i < items.length && items[i]?.mime.startsWith('image/')) {
        const img = new Image();
        img.src = getThumbUrl(items[i].path);
        preloaded.push(img);
      }
    }
    return () => {
      for (const img of preloaded) {
        img.src = '';
      }
    };
  }, [index, items]);

  if (!current) return null;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(viewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = viewUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight });
    setImageLoaded(true);
  };

  const handleAudioSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audioDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    audio.currentTime = ratio * audioDuration;
  };

  const toggleAudioPlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play();
    else audio.pause();
  };

  const isImage = current.mime.startsWith('image/');
  const isVideo = current.mime.startsWith('video/');
  const isAudio = current.mime.startsWith('audio/');
  const isPdf = current.mime === 'application/pdf';
  const isText = isTextMime(current.mime);
  const isOffice = current.mime.includes('word') || current.mime.includes('document') ||
    current.mime.includes('sheet') || current.mime.includes('excel') ||
    current.mime.includes('presentation') || current.mime.includes('powerpoint') ||
    current.mime === 'application/msword' ||
    current.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    current.mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    current.mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

  return (
    <div
      ref={swipeRef}
      style={swipeDragY > 0 ? {
        transform: `translateY(${swipeDragY}px) scale(${Math.max(0.92, 1 - swipeDragY / (window.innerHeight * 0.6))})`,
        opacity: Math.max(0.5, 1 - swipeDragY / (window.innerHeight * 0.5)),
        transition: 'none',
      } : swipeDragY === 0 ? {
        transform: 'translateY(0px) scale(1)',
        opacity: 1,
        transition: 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.35s ease',
      } : {}}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm touch-pan-y ${!cursorVisible && isVideo ? 'cursor-none' : ''}`}
      onClick={(e) => {
        if (!isZoomed) handleClose();
      }}
      onMouseMove={() => {
        setCursorVisible(true);
        if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
        if (isVideo) {
          cursorTimerRef.current = setTimeout(() => setCursorVisible(false), 3000);
        }
      }}
    >
      {/* Close button */}
      <button
        onClick={() => { handleClose(); }}
        className={`absolute top-4 right-4 p-2 text-white/70 hover:text-white z-10 transition-opacity duration-200 ${isMobile && !uiVisible ? 'opacity-0 pointer-events-none' : ''}`}
        title="关闭 (Esc)"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Swipe-down drag handle (mobile only) — visual hint that you can swipe down to close */}
      {isMobile && (
        <div className={`absolute top-2 left-1/2 -translate-x-1/2 z-10 transition-opacity duration-200 ${!uiVisible ? 'opacity-0' : ''}`}>
          <div className="w-10 h-1 rounded-full bg-white/30" />
        </div>
      )}

      {/* File info bar */}
      <div className={`absolute top-4 left-4 text-white/70 text-sm z-10 flex items-center gap-3 transition-opacity duration-200 ${isMobile && !uiVisible ? 'opacity-0 pointer-events-none' : ''} ${isMobile ? 'max-w-[45%]' : ''}`}>
        <span className={`font-medium text-white/90 ${isMobile ? 'truncate max-w-[120px]' : ''}`}>{name}</span>
        {ext && <span className={`px-1.5 py-0.5 text-[10px] bg-white/10 rounded ${isMobile ? 'hidden' : ''}`}>{ext}</span>}
        {current.size ? <span className={`text-xs text-white/50 ${isMobile ? 'hidden' : ''}`}>{formatSize(current.size)}</span> : null}
        {imageDimensions && (
          <span className={`text-xs text-white/40 ${isMobile ? 'hidden' : ''}`}>{imageDimensions.w} × {imageDimensions.h}</span>
        )}
        <span className="text-white/40 whitespace-nowrap">({index + 1} / {items.length})</span>
      </div>

      {/* Action buttons - top bar on desktop, bottom bar on mobile */}
      {isMobile ? (
        <div className={`fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent pt-8 pb-2 px-2 z-10 flex items-center justify-center gap-0.5 overflow-x-auto scrollbar-hide transition-opacity duration-200 ${!uiVisible ? 'opacity-0 pointer-events-none' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button - thumb accessible on mobile */}
          <button
            onClick={(e) => { e.stopPropagation(); handleClose(); }}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0"
            title="关闭 (Esc)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="w-px h-5 bg-white/10 mx-0.5 shrink-0" />
          {/* Zoom controls (images only) */}
          {isImage && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setScale((s) => Math.min(s * 1.3, 8)); }}
                className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0"
                title="放大 (+)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); const ns = scale / 1.3; if (ns <= 1.05) resetZoom(); else setScale(ns); }}
                className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0"
                title="缩小 (-)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                </svg>
              </button>
              {isZoomed && (
                <button
                  onClick={(e) => { e.stopPropagation(); resetZoom(); }}
                  className="p-2 text-blue-400 hover:text-blue-300 hover:bg-white/10 rounded-lg transition-colors shrink-0"
                  title="重置缩放 (0)"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                </button>
              )}
              <div className="w-px h-5 bg-white/10 mx-0.5 shrink-0" />
            </>
          )}
          {/* Slideshow play/pause */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleSlideshow(); }}
            className={`p-2 rounded-lg transition-colors shrink-0 ${slideshowPlaying ? 'text-blue-400 bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
            title={slideshowPlaying ? '暂停幻灯片 (Space)' : '播放幻灯片 (Space)'}
          >
            {slideshowPlaying ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          {/* Slideshow settings */}
          <div className="relative shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); setShowSlideshowMenu(!showSlideshowMenu); }}
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="幻灯片设置"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </button>
          </div>
          <div className="w-px h-5 bg-white/10 mx-1 shrink-0" />
          {/* Info toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowInfo(!showInfo); }}
            className={`p-2 rounded-lg transition-colors shrink-0 ${showInfo ? 'text-blue-400 bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
            title="文件信息 (I)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          {/* Panorama button (for wide images) */}
          {isImage && imageDimensions && imageDimensions.w / imageDimensions.h > 2 && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowPanorama(true); }}
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0"
              title="全景查看"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
            </button>
          )}
          {/* Poster upload (for videos) */}
          {isVideo && (
            <button
              onClick={(e) => { e.stopPropagation(); posterInputRef.current?.click(); }}
              className={`p-2 rounded-lg transition-colors shrink-0 ${posterUploading ? 'text-blue-400 animate-pulse' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
              title="设置视频封面"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </button>
          )}
          <div className="w-px h-5 bg-white/10 mx-1 shrink-0" />
          {/* Copy link */}
          <button
            onClick={(e) => { e.stopPropagation(); handleCopyLink(); }}
            className={`p-2 rounded-lg transition-colors shrink-0 ${copied ? 'text-green-400' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
            title={copied ? '已复制!' : '复制分享链接'}
          >
            {copied ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
            )}
          </button>
          {/* Download */}
          <a
            href={url}
            download={name}
            onClick={(e) => e.stopPropagation()}
            className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0"
            title="下载 (D)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </a>
        </div>
      ) : (
        <div className="absolute top-4 right-16 flex items-center gap-1 z-10">
        {/* Zoom controls (images only) */}
        {isImage && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setScale((s) => Math.min(s * 1.3, 8)); }}
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="放大 (+)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const newScale = scale / 1.3;
                if (newScale <= 1.05) resetZoom();
                else setScale(newScale);
              }}
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="缩小 (-)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
              </svg>
            </button>
            {isZoomed && (
              <button
                onClick={(e) => { e.stopPropagation(); resetZoom(); }}
                className="p-2 text-blue-400 hover:text-blue-300 hover:bg-white/10 rounded-lg transition-colors"
                title="重置缩放 (0)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            )}
          </>
        )}

        {/* Slideshow play/pause */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleSlideshow(); }}
          className={`p-2 rounded-lg transition-colors ${slideshowPlaying ? 'text-blue-400 bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
          title={slideshowPlaying ? '暂停幻灯片 (Space)' : '播放幻灯片 (Space)'}
        >
          {slideshowPlaying ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Slideshow settings (long-press or right-click) */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowSlideshowMenu(!showSlideshowMenu); }}
            className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="幻灯片设置"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>
          {showSlideshowMenu && (
            <div
              className={`${
                isMobile
                  ? 'fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-md border-t border-white/10 rounded-t-xl p-4 z-20 text-sm max-h-[50vh] overflow-y-auto'
                  : 'absolute right-0 top-full mt-1 bg-gray-900/95 backdrop-blur-md border border-white/10 rounded-xl p-3 z-20 min-w-[200px] text-sm'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {isMobile && (
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-white/70 text-xs font-medium uppercase tracking-wider">幻灯片设置</h5>
                  <button
                    onClick={() => setShowSlideshowMenu(false)}
                    className="p-1 text-white/50 hover:text-white"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              {!isMobile && <h5 className="text-white/50 text-xs font-medium uppercase tracking-wider mb-2">幻灯片设置</h5>}

              {/* Speed */}
              <div className="mb-3">
                <label className="text-white/40 text-xs block mb-1">切换间隔</label>
                <div className="flex gap-1">
                  {[2, 3, 5, 10].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSlideshowSpeed(s)}
                      className={`flex-1 px-2 py-1 text-xs rounded-md transition-colors ${
                        slideshowSpeed === s
                          ? 'bg-blue-500 text-white'
                          : 'bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
              </div>

              {/* Loop toggle */}
              <button
                onClick={() => setSlideshowLoop(!slideshowLoop)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors mb-1"
              >
                <span className="text-white/70 text-xs">循环播放</span>
                <div className={`w-8 h-4 rounded-full transition-colors relative ${slideshowLoop ? 'bg-blue-500' : 'bg-white/20'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${slideshowLoop ? 'left-4' : 'left-0.5'}`} />
                </div>
              </button>

              {/* Shuffle toggle */}
              <button
                onClick={() => setSlideshowShuffle(!slideshowShuffle)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors"
              >
                <span className="text-white/70 text-xs">随机顺序</span>
                <div className={`w-8 h-4 rounded-full transition-colors relative ${slideshowShuffle ? 'bg-blue-500' : 'bg-white/20'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${slideshowShuffle ? 'left-4' : 'left-0.5'}`} />
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Info toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowInfo(!showInfo); }}
          className={`p-2 rounded-lg transition-colors ${showInfo ? 'text-blue-400 bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
          title="文件信息 (I)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        {/* Panorama button (for wide images) */}
        {isImage && imageDimensions && imageDimensions.w / imageDimensions.h > 2 && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowPanorama(true); }}
            className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="全景查看"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
          </button>
        )}
        {/* Set poster frame (for videos) */}
        {isVideo && (
          <>
            <input ref={posterInputRef} type="file" accept="image/*" className="hidden" onChange={handlePosterUpload} />
            <button
              onClick={(e) => { e.stopPropagation(); posterInputRef.current?.click(); }}
              className={`p-2 rounded-lg transition-colors ${posterUploading ? 'text-blue-400 animate-pulse' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
              title="设置视频封面"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </button>
          </>
        )}
        {/* Copy link */}
        <button
          onClick={(e) => { e.stopPropagation(); handleCopyLink(); }}
          className={`p-2 rounded-lg transition-colors ${copied ? 'text-green-400' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
          title={copied ? '已复制!' : '复制分享链接'}
        >
          {copied ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          )}
        </button>
        {/* Download */}
        <a
          href={url}
          download={name}
          onClick={(e) => e.stopPropagation()}
          className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          title="下载 (D)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </a>
      </div>
      )}

      {/* Zoom level indicator */}
      {isImage && isZoomed && (
        <div className={`absolute bottom-16 left-1/2 -translate-x-1/2 bg-black/70 text-white/80 text-xs px-3 py-1.5 rounded-full z-10 pointer-events-none select-none transition-opacity duration-200 ${isMobile && !uiVisible ? 'opacity-0' : ''}`}>
          {Math.round(scale * 100)}% · 拖动平移 · 双击重置
        </div>
      )}

      {/* Info panel */}
      {showInfo && (
        <div
          className={`${
            isMobile
              ? 'fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-md border-t border-white/10 rounded-t-xl p-4 z-20 max-h-[60vh] overflow-y-auto text-sm'
              : 'absolute top-16 right-4 bg-gray-900/95 backdrop-blur-md border border-white/10 rounded-xl p-4 z-10 min-w-[260px] text-sm'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button on mobile */}
          {isMobile && (
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-white font-medium">文件信息</h4>
              <button
                onClick={() => setShowInfo(false)}
                className="p-1 text-white/50 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          {!isMobile && <h4 className="text-white font-medium mb-3">文件信息</h4>}
          <div className="space-y-2 text-white/70">
            <div className="flex justify-between gap-4">
              <span className="text-white/40">名称</span>
              <span className="text-right break-all">{name}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/40">类型</span>
              <span>{current.mime}</span>
            </div>
            {current.size ? (
              <div className="flex justify-between gap-4">
                <span className="text-white/40">大小</span>
                <span>{formatSize(current.size)}</span>
              </div>
            ) : null}
            {imageDimensions && (
              <div className="flex justify-between gap-4">
                <span className="text-white/40">尺寸</span>
                <span>{imageDimensions.w} × {imageDimensions.h} px</span>
              </div>
            )}
            {imageDimensions && (
              <div className="flex justify-between gap-4">
                <span className="text-white/40">宽高比</span>
                <span>{getAspectRatio(imageDimensions.w, imageDimensions.h)}</span>
              </div>
            )}
            {imageDimensions && (
              <div className="flex justify-between gap-4">
                <span className="text-white/40">百万像素</span>
                <span>{((imageDimensions.w * imageDimensions.h) / 1_000_000).toFixed(1)} MP</span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span className="text-white/40">路径</span>
              <span className="text-right break-all text-xs">{current.path}</span>
            </div>
          </div>

          {/* EXIF data */}
          {current.mime.startsWith('image/') && (exifData || exifLoading) && (
            <>
              <hr className="border-white/10 my-3" />
              <h4 className="text-white/80 font-medium text-xs uppercase tracking-wider mb-2">📷 拍摄信息</h4>
              {exifLoading ? (
                <div className="text-white/40 text-xs flex items-center gap-2">
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  解析 EXIF 数据中...
                </div>
              ) : exifData ? (
                <div className="space-y-1.5 text-white/70 text-xs">
                  {exifData.camera && (
                    <div className="flex justify-between gap-3">
                      <span className="text-white/40">相机</span>
                      <span className="text-right">{exifData.camera}</span>
                    </div>
                  )}
                  {exifData.lens && (
                    <div className="flex justify-between gap-3">
                      <span className="text-white/40">镜头</span>
                      <span className="text-right">{exifData.lens}</span>
                    </div>
                  )}
                  {(exifData.focalLength || exifData.aperture) && (
                    <div className="flex justify-between gap-3">
                      <span className="text-white/40">参数</span>
                      <span className="text-right">
                        {exifData.focalLength}{exifData.aperture ? ` ${exifData.aperture}` : ''}
                      </span>
                    </div>
                  )}
                  {(exifData.shutterSpeed || exifData.iso) && (
                    <div className="flex justify-between gap-3">
                      <span className="text-white/40">曝光</span>
                      <span className="text-right">
                        {exifData.shutterSpeed}{exifData.iso ? ` ISO ${exifData.iso}` : ''}
                      </span>
                    </div>
                  )}
                  {exifData.dateTaken && (
                    <div className="flex justify-between gap-3">
                      <span className="text-white/40">拍摄时间</span>
                      <span className="text-right">
                        {new Date(exifData.dateTaken).toLocaleString('zh-CN', {
                          year: 'numeric', month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                  )}
                  {exifData.software && (
                    <div className="flex justify-between gap-3">
                      <span className="text-white/40">软件</span>
                      <span className="text-right">{exifData.software}</span>
                    </div>
                  )}
                  {exifData.gps && (
                    <div className="flex justify-between gap-3">
                      <span className="text-white/40">位置</span>
                      <a
                        href={`https://maps.google.com/maps?q=${exifData.gps.lat},${exifData.gps.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-right underline underline-offset-2"
                      >
                        📍 {exifData.gps.lat.toFixed(4)}, {exifData.gps.lng.toFixed(4)}
                      </a>
                    </div>
                  )}
                </div>
              ) : null}
            </>
          )}

          <hr className="border-white/10 my-3" />
          {/* Share link */}
          <div className="space-y-2">
            <button
              onClick={handleCopyLink}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white/80"
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  已复制!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  复制分享链接
                </>
              )}
            </button>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(directUrl);
                } catch { /* silent */ }
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-white/50 text-xs"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              复制图片直链
            </button>
          </div>
        </div>
      )}

      {/* Previous button */}
      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className={`absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all z-10 ${isMobile && !uiVisible ? 'opacity-0 pointer-events-none' : ''}`}
          title="上一张 (←)"
        >
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Next button */}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          className={`absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all z-10 ${isMobile && !uiVisible ? 'opacity-0 pointer-events-none' : ''}`}
          title="下一张 (→)"
        >
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Swipe direction indicators */}
      {swipeHint === 'left' && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-16 h-32 bg-gradient-to-r from-blue-500/30 to-transparent rounded-r-xl pointer-events-none animate-pulse" />
      )}
      {swipeHint === 'right' && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-16 h-32 bg-gradient-to-l from-blue-500/30 to-transparent rounded-l-xl pointer-events-none animate-pulse" />
      )}
      {swipeHint === 'down' && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-12 bg-gradient-to-t from-blue-500/30 to-transparent rounded-t-xl pointer-events-none animate-pulse" />
      )}

      {/* Mobile hints */}
      <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 text-white/30 text-xs md:hidden pointer-events-none select-none transition-opacity duration-200 ${!uiVisible ? 'opacity-0' : ''}`}>
        {isZoomed ? (
          <span>双指缩放 · 拖动平移 · 双击重置</span>
        ) : (
          <>
            <span>← 滑动切换</span>
            <span>·</span>
            <span>下滑关闭</span>
            <span>·</span>
            <span>切换 →</span>
          </>
        )}
      </div>

      {/* Slideshow progress bar */}
      {slideshowPlaying && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 z-20">
          <div
            className="h-full bg-blue-500 transition-all duration-75 ease-linear"
            style={{ width: `${Math.min(slideshowProgress, 100)}%` }}
          />
        </div>
      )}

      {/* Slideshow status indicator */}
      {slideshowPlaying && (
        <div className="absolute bottom-3 right-4 flex items-center gap-2 bg-black/60 text-white/70 text-xs px-3 py-1.5 rounded-full z-10 pointer-events-none select-none">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          幻灯片 · {slideshowSpeed}s
          {slideshowShuffle && ' · 随机'}
          {slideshowLoop && ' · 循环'}
        </div>
      )}

      {/* Desktop zoom hint */}
      {isImage && !isZoomed && !slideshowPlaying && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden md:flex items-center gap-2 text-white/20 text-xs pointer-events-none select-none">
          <span>滚轮缩放 · 双击放大 · Space 幻灯片 · +/- 键缩放</span>
        </div>
      )}

      {/* Content */}
      <div
        ref={imgContainerRef}
        className="max-w-[90vw] max-h-[90vh] relative"
        onClick={(e) => {
          e.stopPropagation();
          if (isImage) handleImageClick(e);
          else if (!isVideo && !isAudio && !isPdf && !isText && !isZoomed) handleClose();
        }}
        onMouseDown={handleMouseDown}
        style={{ cursor: isZoomed ? 'grab' : 'default' }}
      >
        {/* Loading spinner */}
        {isImage && !imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white/50" />
          </div>
        )}

        {isImage ? (
          <>
            {/* Blurred thumbnail placeholder — shows while full image loads */}
            {!imageLoaded && (
              <img
                src={getThumbUrl(current.path)}
                alt=""
                className="absolute inset-0 w-full h-full object-contain rounded-lg pointer-events-none"
                style={{
                  filter: 'blur(25px)',
                  transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
                  transition: isDragging.current ? 'none' : 'transform 0.15s ease-out',
                  transformOrigin: 'center center',
                }}
                draggable={false}
              />
            )}
            <img
              key={current.path}
              src={url}
              alt={name}
              className={`max-w-full max-h-[90vh] object-contain rounded-lg transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
              style={{
                transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
                transition: isDragging.current ? 'none' : 'transform 0.15s ease-out',
                transformOrigin: 'center center',
              }}
              draggable={false}
              onLoad={handleImageLoad}
            />
          </>
        ) : isUrlFile ? (
          <div className="flex flex-col items-center gap-4 w-[85vw] max-w-[900px] h-[85vh]" onClick={(e) => e.stopPropagation()}>
            {urlLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white/50" />
              </div>
            ) : urlContent ? (
              (() => {
                const ytMatch = urlContent.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
                const vimeoMatch = urlContent.match(/vimeo\.com\/(\d+)/);
                if (ytMatch) {
                  return <iframe src={`https://www.youtube.com/embed/${ytMatch[1]}`} className="w-full flex-1 rounded-lg border border-white/10" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title={name} />;
                }
                if (vimeoMatch) {
                  return <iframe src={`https://player.vimeo.com/video/${vimeoMatch[1]}`} className="w-full flex-1 rounded-lg border border-white/10" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title={name} />;
                }
                return (
                  <div className="flex flex-col items-center gap-4 p-8">
                    <svg className="w-16 h-16 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                    <p className="text-white/60 text-sm">{urlContent}</p>
                    <a href={urlContent} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-blue-500/80 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm">打开链接</a>
                  </div>
                );
              })()
            ) : (
              <div className="flex items-center justify-center h-full text-white/40">无法加载链接</div>
            )}
          </div>
        ) : isHls ? (
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/50" /></div>}>
              <HlsPlayer src={url} autoplay onEnded={goNext} />
            </Suspense>
          </div>
        ) : isVideo ? (
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <VideoPlayer
              key={current.path}
              path={current.path}
              name={name}
              autoplay={true}
              loop={true}
              onEnded={goNext}
            />
          </div>
        ) : isAudio ? (
          <div
            className="flex flex-col items-center gap-5 p-8 bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl min-w-[340px] max-w-[460px]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Music icon */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500/30 to-blue-500/30 flex items-center justify-center border border-white/10">
              <svg className="w-10 h-10 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>

            {/* File name */}
            <p className="text-white/80 text-sm font-medium text-center truncate max-w-full px-4">{name}</p>

            {/* Progress bar */}
            <div className="w-full px-2">
              <div
                className="w-full h-1.5 bg-white/10 rounded-full cursor-pointer group relative"
                onClick={handleAudioSeek}
              >
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full relative group-hover:from-purple-400 group-hover:to-blue-400 transition-colors"
                  style={{ width: `${audioDuration ? (audioCurrentTime / audioDuration) * 100 : 0}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <div className="flex justify-between mt-2 text-[11px] text-white/40 font-mono">
                <span>{formatTime(audioCurrentTime)}</span>
                <span>{formatTime(audioDuration)}</span>
              </div>
            </div>

            {/* Playback controls */}
            <div className="flex items-center gap-6">
              <button
                onClick={(e) => { e.stopPropagation(); if (hasPrev) goPrev(); }}
                className={`p-2 transition-colors ${hasPrev ? 'text-white/40 hover:text-white' : 'text-white/10 cursor-default'}`}
                title="上一个"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                </svg>
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); toggleAudioPlay(); }}
                className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                {audioPlaying ? (
                  <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-7 h-7 ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); if (hasNext) goNext(); }}
                className={`p-2 transition-colors ${hasNext ? 'text-white/40 hover:text-white' : 'text-white/10 cursor-default'}`}
                title="下一个"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              </button>
            </div>

            {/* Hidden audio element */}
            <audio
              ref={audioRef}
              src={url}
              autoPlay
              onTimeUpdate={(e) => setAudioCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration)}
              onPlay={() => setAudioPlaying(true)}
              onPause={() => setAudioPlaying(false)}
              onEnded={() => setAudioPlaying(false)}
            />
          </div>
        ) : isPdf ? (
          <div
            className="flex flex-col items-center gap-4 w-[85vw] max-w-[900px] h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              src={`${url}#toolbar=1&navpanes=1&scrollbar=1`}
              className="w-full flex-1 rounded-lg border border-white/10 bg-white"
              title={name}
            />
            <div className="flex items-center gap-3">
              <a
                href={url}
                download={name}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white/80 rounded-lg transition-colors text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                下载 PDF
              </a>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white/80 rounded-lg transition-colors text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                新窗口打开
              </a>
            </div>
          </div>
        ) : isOffice ? (
          <div
            className="flex flex-col items-center gap-4 w-[85vw] max-w-[900px] h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              src={`https://docs.google.com/gview?url=${encodeURIComponent(directUrl)}&embedded=true`}
              className="w-full flex-1 rounded-lg border border-white/10 bg-white"
              title={name}
            />
            <div className="flex items-center gap-3">
              <a
                href={url}
                download={name}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white/80 rounded-lg transition-colors text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                下载文件
              </a>
              <span className="text-white/30 text-xs">预览由 Google Docs Viewer 提供</span>
            </div>
          </div>
        ) : isText ? (
          <div
            className="w-[85vw] max-w-[900px] h-[80vh] flex flex-col bg-gray-900/90 backdrop-blur-xl rounded-xl border border-white/10 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {textLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/50" />
              </div>
            ) : textContent !== null ? (
              <MarkdownEditor
                content={textContent}
                fileName={name}
                onSave={async (newContent: string) => {
                  if (!current) return;
                  setTextSaving(true);
                  try {
                    await saveFile(current.path, newContent);
                    setTextContent(newContent);
                  } catch (e) {
                    console.error('Save failed:', e);
                  } finally {
                    setTextSaving(false);
                  }
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-white/40">
                无法加载文本内容
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-900/80 backdrop-blur-xl p-8 rounded-xl text-center border border-white/10">
            <p className="text-lg mb-4 text-white/80">{name}</p>
            <a
              href={url}
              download={name}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500/80 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              下载文件
            </a>
          </div>
        )}
      </div>
      {showPanorama && current?.mime.startsWith('image/') && (
        <Suspense fallback={<div className="fixed inset-0 bg-black z-50 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/50" /></div>}>
          <PanoramaViewer src={url} onClose={() => setShowPanorama(false)} />
        </Suspense>
      )}
      {showKeyboardHelp && (
        <Suspense fallback={null}>
          <KeyboardShortcutsLightbox onClose={() => setShowKeyboardHelp(false)} />
        </Suspense>
      )}
    </div>
  );
}
