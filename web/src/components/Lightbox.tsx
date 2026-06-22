import { useEffect, useCallback, useState, useRef, useMemo, lazy, Suspense } from 'react';
import { getFileUrl, getThumbUrl, getExif, saveFile, uploadCustomThumb, type ExifData } from '../api';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import VideoPlayer from './VideoPlayer';
import CodeEditor from './CodeEditor';
import MarkdownEditor from './MarkdownEditor';
import AudioPlayer from './AudioPlayer';
import { toast } from '../hooks/useToast';

// Lazy-load heavy components (hls.js is ~400KB)
const HlsPlayer = lazy(() => import('./HlsPlayer'));
const PanoramaViewer = lazy(() => import('./PanoramaViewer'));
import { formatSize, getAspectRatio } from '../utils';
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
  /** Called when user wants to delete the current file */
  onDelete?: (path: string) => void;
  onDuplicate?: (path: string) => void;
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

export default function Lightbox({ items, index, onClose, onNavigate, onDelete, onDuplicate }: Props) {
  const current = items[index];
  const hasPrev = items.length > 1;
  const hasNext = items.length > 1;
  const [copied, setCopied] = useState(false);
  const [directUrlCopied, setDirectUrlCopied] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [nameCopied, setNameCopied] = useState(false);
  const [exifData, setExifData] = useState<ExifData | null>(null);
  const [exifLoading, setExifLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [autoRetrying, setAutoRetrying] = useState(false);
  const retryKeyRef = useRef(0);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null);
  const [swipeHint, setSwipeHint] = useState<'left' | 'right' | 'down' | null>(null);
  // Ref to prevent click-after-swipe bug on mobile — browsers synthesize a click
  // after touchend even when the user was swiping, which would close the lightbox
  const wasSwipingRef = useRef(false);
  const wasSwipingTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // === Slideshow state ===
  const [slideshowPlaying, setSlideshowPlaying] = useState(false);
  const [slideshowSpeed, setSlideshowSpeed] = useState(3); // seconds
  const [slideshowShuffle, setSlideshowShuffle] = useState(false);
  const [slideshowLoop, setSlideshowLoop] = useState(true);
  const [slideshowProgress, setSlideshowProgress] = useState(0);
  const [showSlideshowMenu, setShowSlideshowMenu] = useState(false);
  const [showMoreTools, setShowMoreTools] = useState(false);
  // Toolbar horizontal scroll indicator — shows fade on right edge when content overflows
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarCanScroll, setToolbarCanScroll] = useState(false);
  const slideshowTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideshowProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playedIndicesRef = useRef<Set<number>>(new Set([index]));
  // Ref for slideshowSpeed to avoid stale closures in keyboard handler
  const slideshowSpeedRef = useRef(slideshowSpeed);
  slideshowSpeedRef.current = slideshowSpeed;

  // === Reduced motion support — respects system accessibility preference ===
  const [prefersReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  // === Zoom state ===
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragOffsetStart = useRef({ x: 0, y: 0 });
  const pinchStartDist = useRef(0);
  const pinchStartScale = useRef(1);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  // Refs for zoom state to avoid event listener re-registration per frame
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  scaleRef.current = scale;
  offsetRef.current = offset;

  // Ref bundle for keyboard handler — synced every render so the effect can use [] deps
  const keyboardRef = useRef({
    handleClose: () => {},
    goPrev: () => {},
    goNext: () => {},
    handleCopyFileName: () => {},
    goPrev10: () => {},
    goNext10: () => {},
    resetZoom: () => {},
    toggleSlideshow: () => {},
    handleDeleteConfirm: () => {},
    handleDeleteExecute: () => {},
    scale: 1,
    url: '',
    name: '',
    isZoomed: false,
    current: null as any,
    showMoreTools: false,
    showInfo: false,
    showSlideshowMenu: false,
    showKeyboardHelp: false,
    confirmDelete: false,
    onDelete: null as ((path: string) => void) | null,
    onDuplicate: null as ((path: string) => void) | null,
    slideshowTimerRef: { current: null as number | null },
    imgContainerRef: { current: null as HTMLElement | null },
  });

  // Text content state
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textSaving, setTextSaving] = useState(false);
  const [textError, setTextError] = useState<'too-large' | 'fetch-error' | null>(null);

  // .url file content state
  const [urlContent, setUrlContent] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);

  // Office document iframe loading state
  const [officeLoaded, setOfficeLoaded] = useState(false);
  const officeLoadTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Panorama state
  const [showPanorama, setShowPanorama] = useState(false);

  // Keyboard shortcuts help state
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  // Image rotation (0, 90, 180, 270)
  const [rotation, setRotation] = useState(0);

  // === Fullscreen API state ===
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
  const toggleFullscreen = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // === Crossfade transition state ===
  // Holds the previous image URL to render while fading out during navigation
  const prevImageUrlRef = useRef<string>('');
  const [crossfadeUrl, setCrossfadeUrl] = useState<string | null>(null);

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
  const uiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const UI_AUTO_HIDE_DELAY = 3000; // ms — hide controls after inactivity

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

  // Reset retry count, error, and loading states when navigating to a new image
  useEffect(() => {
    retryCountRef.current = 0;
    setAutoRetrying(false);
    setImageError(false);
    setImageLoaded(false);
  }, [current?.path]);

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

  // Zoom indicator — briefly shows current zoom level when zooming
  useEffect(() => {
    if (scale > 1.05 && isImage) {
      setShowZoomIndicator(true);
      const timer = setTimeout(() => setShowZoomIndicator(false), 1200);
      return () => clearTimeout(timer);
    }
    setShowZoomIndicator(false);
  }, [scale]);

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
      onNavigate(index === 0 ? items.length - 1 : index - 1);
      setSwipeHint('right');
      setTimeout(() => setSwipeHint(null), 300);
    }
  }, [hasPrev, index, onNavigate, resetZoom, items.length]);

  const goNext = useCallback(() => {
    if (hasNext) {
      resetZoom();
      onNavigate(index === items.length - 1 ? 0 : index + 1);
      setSwipeHint('left');
      setTimeout(() => setSwipeHint(null), 300);
    }
  }, [hasNext, index, onNavigate, resetZoom, items.length]);

  const goPrev10 = useCallback(() => {
    if (items.length <= 1) return;
    const target = Math.max(0, index - 10);
    resetZoom();
    onNavigate(target);
    setSwipeHint('right');
    setTimeout(() => setSwipeHint(null), 300);
  }, [index, onNavigate, resetZoom, items.length]);

  const goNext10 = useCallback(() => {
    if (items.length <= 1) return;
    const target = Math.min(items.length - 1, index + 10);
    resetZoom();
    onNavigate(target);
    setSwipeHint('left');
    setTimeout(() => setSwipeHint(null), 300);
  }, [index, onNavigate, resetZoom, items.length]);

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

  // Stop slideshow on unmount; lock body scroll while lightbox is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      if (slideshowTimerRef.current) clearTimeout(slideshowTimerRef.current);
      if (slideshowProgressRef.current) clearInterval(slideshowProgressRef.current);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Mobile toolbar scroll detection — shows fade when content overflows
  const checkToolbarScroll = useCallback(() => {
    const el = toolbarRef.current;
    if (!el) return;
    setToolbarCanScroll(el.scrollWidth > el.clientWidth && el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    checkToolbarScroll();
    const handleScroll = () => checkToolbarScroll();
    el.addEventListener('scroll', handleScroll, { passive: true });
    // Recheck on resize
    const ro = new ResizeObserver(() => checkToolbarScroll());
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', handleScroll);
      ro.disconnect();
    };
  }, [checkToolbarScroll]);

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

  // Clean up auto-hide timer on unmount
  useEffect(() => {
    return () => {
      if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    };
  }, []);

  // Disable swipe gestures when zoomed
  const handleClose = useCallback(() => {
    setSwipeDragY(0);
    stopSlideshow();
    // Clean up auto-hide timer and reset UI visibility
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    setUiVisible(true);
    onClose();
  }, [stopSlideshow, onClose]);

  const handleCopyFileName = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(name);
      setNameCopied(true);
      setTimeout(() => setNameCopied(false), 2000);
    } catch { /* silent */ }
  }, [name]);

  // Wrapper — sets wasSwiping ref to prevent the browser's synthesized
  // click event from closing the lightbox immediately after a swipe gesture
  const wrapSwipe = useCallback((fn: () => void) => {
    return () => {
      wasSwipingRef.current = true;
      clearTimeout(wasSwipingTimerRef.current);
      wasSwipingTimerRef.current = setTimeout(() => { wasSwipingRef.current = false; }, 350);
      fn();
    };
  }, []);

  const swipeRef = useSwipeGesture({
    onSwipeLeft: wrapSwipe(goNext),
    onSwipeRight: wrapSwipe(goPrev),
    onSwipeDown: wrapSwipe(handleClose),
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
      const currentScale = scaleRef.current;
      const newScale = currentScale * (1 + delta);
      zoomAtPoint(e.clientX, e.clientY, newScale);

      if (newScale <= 1.05) {
        setTimeout(() => resetZoom(), 50);
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [current, zoomAtPoint, resetZoom]);

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
        pinchStartScale.current = scaleRef.current;
      } else if (e.touches.length === 1 && scaleRef.current > 1.05) {
        // Dragging when zoomed
        isDragging.current = true;
        dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        dragOffsetStart.current = { ...offsetRef.current };
      } else if (e.touches.length === 1) {
        // Double-tap detection for mobile — works independently of pinch/drag
        const now = Date.now();
        const touch = e.touches[0];
        const lastTime = lastTapTimeRef.current;
        const lastPos = lastTapPosRef.current;
        if (
          lastTime > 0 &&
          now - lastTime < 300 &&
          Math.abs(touch.clientX - lastPos.x) < 30 &&
          Math.abs(touch.clientY - lastPos.y) < 30
        ) {
          // Double-tap — toggle zoom at the tap point
          e.preventDefault();
          isDoubleTapRef.current = true;
          if (scaleRef.current > 1.05) {
            resetZoom();
          } else {
            zoomAtPoint(touch.clientX, touch.clientY, 2.5);
          }
          lastTapTimeRef.current = 0;
          return;
        }
        // Store this tap's time/position for potential double-tap
        lastTapTimeRef.current = now;
        lastTapPosRef.current = { x: touch.clientX, y: touch.clientY };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = getTouchDist(e.touches);
        const center = getTouchCenter(e.touches);
        const newScale = pinchStartScale.current * (dist / pinchStartDist.current);
        zoomAtPoint(center.x, center.y, newScale);
      } else if (e.touches.length === 1 && isDragging.current && scaleRef.current > 1.05) {
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
      if (e.touches.length < 2 && scaleRef.current <= 1.05) {
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
  }, [current, zoomAtPoint, resetZoom]);

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
  const lastTapTimeRef = useRef(0);
  const lastTapPosRef = useRef({ x: 0, y: 0 });
  const isDoubleTapRef = useRef(false);
  const handleImageClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    // If a mobile double-tap was already handled by the touch handler,
    // skip the UI toggle that would fire on the second tap's synthesize click
    if (isDoubleTapRef.current) {
      isDoubleTapRef.current = false;
      return;
    }
    if (now - lastClickTime.current < 300) {
      // Double click — toggle zoom
      if (isZoomed) {
        resetZoom();
      } else {
        zoomAtPoint(e.clientX, e.clientY, 2.5);
      }
      lastClickTime.current = 0;
      return;
    }
    lastClickTime.current = now;

    // Edge tap navigation: left 30% = prev, right 30% = next
    if (!isZoomed && e.target instanceof HTMLElement) {
      const rect = e.target.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      if (relX < 0.3 && hasPrev) {
        resetZoom();
        onNavigate(index === 0 ? items.length - 1 : index - 1);
        return;
      }
      if (relX > 0.7 && hasNext) {
        resetZoom();
        onNavigate(index === items.length - 1 ? 0 : index + 1);
        return;
      }
    }

    // Single click in center area — toggle UI visibility on mobile
    if (isMobile) {
      setUiVisible((v) => !v);
    }
  }, [isZoomed, isMobile, zoomAtPoint, resetZoom, hasPrev, hasNext, index, onNavigate, items.length]);

  const handleDeleteConfirm = useCallback(() => {
    if (!current || deleting) return;
    setConfirmDelete(true);
  }, [current, deleting]);

  const handleDeleteExecute = useCallback(async () => {
    if (!current || !onDelete || deleting) return;
    setDeleting(true);
    setConfirmDelete(false);
    try {
      onDelete(current.path);
    } catch {
      setDeleting(false);
    }
  }, [current, onDelete, deleting]);

  // Sync keyboard ref with latest values on every render
  keyboardRef.current = {
    handleClose,
    goPrev,
    goNext,
    handleCopyFileName,
    goPrev10,
    goNext10,
    resetZoom,
    toggleSlideshow,
    handleDeleteConfirm,
    handleDeleteExecute,
    scale,
    url: url ?? '',
    name: name ?? '',
    isZoomed,
    current,
    showMoreTools,
    showInfo,
    showSlideshowMenu,
    showKeyboardHelp,
    confirmDelete,
    onDelete: onDelete ?? null,
    onDuplicate: onDuplicate ?? null,
    slideshowTimerRef: slideshowTimerRef as { current: number | null },
    imgContainerRef,
  };

  // Keyboard shortcuts — stabilized with refs so the DOM listener is never re-registered
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const kb = keyboardRef.current;
      // Ignore when typing in inputs or when a focusable element might conflict
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'A' || target.isContentEditable) return;

      if (e.key === 'Escape') {
        // Close any open overlay sheets first
        if (kb.showMoreTools) { setShowMoreTools(false); return; }
        if (kb.showInfo) { setShowInfo(false); return; }
        if (kb.showSlideshowMenu) { setShowSlideshowMenu(false); return; }
        if (kb.showKeyboardHelp) { setShowKeyboardHelp(false); return; }
        if (kb.confirmDelete) { setConfirmDelete(false); return; }
        if (kb.isZoomed) {
          kb.resetZoom();
        } else {
          kb.handleClose();
        }
      } else if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) { e.preventDefault(); kb.goPrev10(); }
      else if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) { e.preventDefault(); kb.goNext10(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); kb.goPrev(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); kb.goNext(); }
      else if (e.key === 'i') setShowInfo((s) => !s);
      else if (e.key === 'd') setShowMoreTools((s) => !s);
      else if (e.key === '?' || e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        setShowKeyboardHelp((s) => !s);
      }
      else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        // Zoom in centered on the image container
        const container = kb.imgContainerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, kb.scale * 1.3);
        } else {
          setScale((s) => Math.min(s * 1.3, 8));
        }
      } else if (e.key === '-') {
        e.preventDefault();
        const newScale = kb.scale / 1.3;
        if (newScale <= 1.05) { kb.resetZoom(); }
        else {
          const container = kb.imgContainerRef.current;
          if (container) {
            const rect = container.getBoundingClientRect();
            zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, newScale);
          } else {
            setScale(newScale);
          }
        }
      } else if (e.key === '0') {
        kb.resetZoom();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        kb.handleCopyFileName();
      } else if (e.key === 'd' || e.key === 'D') {
        if (!kb.isZoomed) {
          e.preventDefault();
          const a = document.createElement('a');
          a.href = kb.url;
          a.download = kb.name;
          a.click();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        window.open(kb.url, '_blank');
      } else if (e.key === ' ' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (kb.current?.mime.startsWith('video/')) {
          // Space toggles play/pause when viewing a video
          const videoEl = kb.imgContainerRef.current?.querySelector('video');
          if (videoEl) {
            if (videoEl.paused) videoEl.play().catch(() => {});
            else videoEl.pause();
          }
        } else {
          kb.toggleSlideshow();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      } else if (e.key === 'r') {
        e.preventDefault();
        setRotation(r => (r + 90) % 360);
      } else if (e.key === 'R') {
        e.preventDefault();
        setRotation(r => (r - 90 + 360) % 360);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && kb.onDelete) {
        e.preventDefault();
        kb.handleDeleteConfirm();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        kb.handleClose();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D') && kb.onDuplicate) {
        e.preventDefault();
        kb.onDuplicate(kb.current?.path);
      } else if (e.key === ']' || e.key === '[') {
        // Slideshow speed shortcuts — only active when slideshow is playing
        if (!kb.slideshowTimerRef.current) return;
        e.preventDefault();
        const step = 0.5;
        if (e.key === ']') {
          setSlideshowSpeed(s => Math.max(1, s - step));
        } else {
          setSlideshowSpeed(s => Math.min(30, s + step));
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, []);

  // Reset state on navigation
  useEffect(() => {
    setCopied(false);
    setDirectUrlCopied(false);
    setImageCopied(false);
    setShowInfo(false);
    setExifData(null);
    setExifLoading(false);
    setImageDimensions(null);
    resetZoom();
    setSlideshowProgress(0);
    setTextContent(null);
    setTextLoading(false);
    setTextError(null);
    setOfficeLoaded(false);
    if (officeLoadTimerRef.current) {
      clearTimeout(officeLoadTimerRef.current);
      officeLoadTimerRef.current = undefined;
    }
  }, [index, resetZoom]);

  // Crossfade transition — smoothly fades the previous image out as the new one loads
  useEffect(() => {
    const oldUrl = prevImageUrlRef.current;
    prevImageUrlRef.current = url;
    if (!oldUrl || oldUrl === url || !current?.mime.startsWith('image/')) return;
    setCrossfadeUrl(oldUrl);
    const timer = setTimeout(() => setCrossfadeUrl(null), 350);
    return () => clearTimeout(timer);
  }, [url]);

  // Preload adjacent items: full-size originals for ±1, thumbnails for ±2
  // Skips preload in huge collections (>200) to avoid burst network requests
  useEffect(() => {
    if (!current?.mime.startsWith('image/')) return;
    if (items.length > 200) return;

    const preloadIndices = [index - 2, index - 1, index + 1, index + 2];
    const preloaded: HTMLImageElement[] = [];
    for (const i of preloadIndices) {
      if (i >= 0 && i < items.length && items[i]?.mime.startsWith('image/')) {
        const distance = Math.abs(i - index);
        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        if (distance <= 1) {
          // Preload full-size original for immediate neighbors (smooth navigation)
          img.src = getFileUrl(items[i].path);
        } else {
          // Preload thumbnail for farther neighbors (quick preview)
          img.src = getThumbUrl(items[i].path);
        }
        preloaded.push(img);
      }
    }
    return () => {
      for (const img of preloaded) {
        img.src = '';
      }
    };
  }, [index, items, current?.path, current?.mime, items.length]);
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
      setTextError(null);
      return;
    }

    // Check file size limit (default 2MB, configurable via localStorage)
    const maxSizeStr = localStorage.getItem('codeMaxLoad');
    const maxSize = maxSizeStr ? parseInt(maxSizeStr, 10) : 2 * 1024 * 1024;
    if (current.size && current.size > maxSize) {
      setTextContent(null);
      setTextLoading(false);
      setTextError('too-large');
      return;
    }

    let cancelled = false;
    setTextLoading(true);
    setTextContent(null);
    setTextError(null);
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
          setTextError('fetch-error');
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

  const handleCopyDirectUrl = async () => {
    try {
      await navigator.clipboard.writeText(directUrl);
      setDirectUrlCopied(true);
      setTimeout(() => setDirectUrlCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = directUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setDirectUrlCopied(true);
      setTimeout(() => setDirectUrlCopied(false), 2000);
    }
  };

  const handleCopyImage = async () => {
    if (!current?.mime.startsWith('image/')) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const mime = blob.type.startsWith('image/') ? blob.type : 'image/png';
      const clipBlob = mime !== blob.type ? new Blob([blob], { type: 'image/png' }) : blob;
      await navigator.clipboard.write([new ClipboardItem({ [mime]: clipBlob })]);
      setImageCopied(true);
      setTimeout(() => setImageCopied(false), 2000);
    } catch {
      toast('error', '复制图片失败');
    }
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight });
    setImageLoaded(true);
    setImageError(false);
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    console.error('Lightbox image load error:', current?.path, img.src);
    retryCountRef.current += 1;
    // Auto-retry once on first error (catches transient blips)
    if (retryCountRef.current === 1) {
      setAutoRetrying(true);
      setImageLoaded(false);
      setTimeout(() => {
        retryKeyRef.current += 1;
        setAutoRetrying(false);
        setImageLoaded(false);
      }, 3000);
    } else {
      setImageError(true);
      setImageLoaded(false);
    }
  };

  const retryImage = () => {
    if (retryCountRef.current >= MAX_RETRIES) return;
    retryCountRef.current += 1;
    retryKeyRef.current += 1;
    setImageError(false);
    setImageLoaded(false);
  };

  const isImage = current.mime.startsWith('image/');
  const isVideo = current.mime.startsWith('video/');
  const isAudio = current.mime.startsWith('audio/');
  const isPdf = current.mime === 'application/pdf';
  const isText = isTextMime(current.mime);
  const isMarkdown = isText && /\.(md|markdown|mdown|mkdn|mkd|mdwn|mkdown|ron)$/i.test(name);
  const isOffice = current.mime.includes('word') || current.mime.includes('document') ||
    current.mime.includes('sheet') || current.mime.includes('excel') ||
    current.mime.includes('presentation') || current.mime.includes('powerpoint') ||
    current.mime === 'application/msword' ||
    current.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    current.mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    current.mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

  // Audio playlist — collect all audio items for the AudioPlayer
  const audioTracks = useMemo(() => {
    return items.filter(it => it.mime.startsWith('audio/')).map(it => ({
      name: it.path.split('/').pop() || it.path,
      path: it.path,
    }));
  }, [items]);
  const audioIndex = items.filter(it => it.mime.startsWith('audio/')).findIndex(it => it.path === current.path);

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
        // Skip click if it was synthesized from a swipe gesture (mobile)
        if (wasSwipingRef.current) return;
        if (!isZoomed) handleClose();
      }}
      onMouseMove={() => {
        setCursorVisible(true);
        if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
        if (isVideo) {
          cursorTimerRef.current = setTimeout(() => setCursorVisible(false), 3000);
        }
        // Desktop: show UI controls on mouse move, auto-hide after delay
        if (!isMobile) {
          setUiVisible(true);
          if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
          uiTimerRef.current = setTimeout(() => {
            // Only auto-hide for images/videos (not text/audio)
            if (isImage || isVideo) {
              setUiVisible(false);
            }
          }, UI_AUTO_HIDE_DELAY);
        }
      }}
    >
      {/* Immersive blurred background — fills entire screen behind the image */}
      {isImage && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
          <img
            src={getThumbUrl(current.path)}
            alt=""
            className="w-full h-full object-cover"
            style={{
              filter: 'blur(50px)',
              opacity: imageLoaded ? 0.35 : 0.55,
              transition: 'opacity 0.3s ease',
              transform: 'scale(1.1)',
            }}
            draggable={false}
          />
        </div>
      )}

      {/* Close button */}
      <button
        onClick={() => { handleClose(); }}
        className={`absolute top-4 right-4 p-2 text-white/70 hover:text-white z-10 transition-opacity duration-200 ${!uiVisible && (isImage || isVideo) ? 'opacity-0 pointer-events-none' : ''}`}
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
      <div className={`absolute top-4 left-4 text-white/70 text-sm z-10 flex items-center gap-3 transition-opacity duration-200 ${!uiVisible && (isImage || isVideo) ? 'opacity-0 pointer-events-none' : ''} ${isMobile ? 'max-w-[45%]' : ''}`}>
        <span className={`font-medium text-white/90 ${isMobile ? 'truncate max-w-[120px]' : ''}`} title={isMobile ? name : undefined}>{name}</span>
        {ext && <span className={`px-1.5 py-0.5 text-[10px] bg-white/10 rounded ${isMobile ? 'hidden' : ''}`}>{ext}</span>}
        {current.size ? <span className={`text-xs text-white/50 ${isMobile ? 'hidden' : ''}`}>{formatSize(current.size)}</span> : null}
        {/* Position indicator: "3 / 15" */}
        {items.length > 1 && (
          <span className="text-xs text-white/40 border-l border-white/10 pl-3 ml-0.5 whitespace-nowrap">
            <span className="font-medium text-white/60">{index + 1}</span>
            <span className="text-white/30"> / {items.length}</span>
          </span>
        )}
        {imageDimensions && (
          <span className={`text-xs ${isMobile ? 'inline-flex items-center gap-1 px-1.5 py-0.5 bg-black/30 rounded' : 'text-white/40'}`}>
            {imageDimensions.w} × {imageDimensions.h}
          </span>
        )}
      </div>

      {/* Action buttons - top bar on desktop, bottom bar on mobile */}
      {isMobile ? (
        <div className={`fixed bottom-0 left-0 right-0 z-10 mobile-safe-bottom transition-opacity duration-200 ${!uiVisible ? 'opacity-0 pointer-events-none' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Primary toolbar: most-used actions always visible */}
          <div className={`relative scroll-fade-right ${toolbarCanScroll ? 'can-scroll' : ''}`}>
            <div ref={toolbarRef} className="flex items-center justify-start gap-0.5 overflow-x-auto scrollbar-hide py-2 px-2" style={{ scrollbarWidth: 'none' }}>
            {/* Close button */}
            <button
              onClick={(e) => { e.stopPropagation(); handleClose(); }}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0"
              title="关闭 (Esc)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {/* Position counter — always visible in bottom toolbar */}
            {items.length > 1 && (
              <span className="text-[11px] text-white/50 font-mono shrink-0 select-none min-w-[2.5rem] text-center px-1" title={`第 ${index + 1} 张，共 ${items.length} 张`}>
                <span className="text-white/70 font-medium">{index + 1}</span>
                <span className="text-white/30">/{items.length}</span>
              </span>
            )}
            <div className="w-px h-5 bg-white/10 mx-0.5 shrink-0" />
            {/* Fullscreen toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0"
              title={isFullscreen ? '退出全屏 (F)' : '全屏显示 (F)'}
            >
              {isFullscreen ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
              )}
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
                <span
                  className="min-w-[2rem] text-center text-xs text-white/60 font-mono shrink-0 select-none"
                  title={isZoomed ? '点击重置缩放' : '缩放比例'}
                  onClick={(e) => { if (isZoomed) { e.stopPropagation(); resetZoom(); } }}
                  style={{ cursor: isZoomed ? 'pointer' : 'default' }}
                >
                  {Math.round(scale * 100)}%
                </span>
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
            {onDelete && (
              <>
                <div className="w-px h-5 bg-white/10 mx-0.5 shrink-0" />
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteConfirm(); }}
                  disabled={deleting}
                  className={`p-2 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0 ${deleting ? 'opacity-50 animate-pulse' : ''}`}
                  title="删除 (Delete)"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </>
            )}
            {/* More button — opens bottom sheet with secondary actions */}
            <div className="relative shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setShowMoreTools(!showMoreTools); }}
                className={`p-2 rounded-lg transition-colors ${showMoreTools ? 'text-blue-400 bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                title="更多操作"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
            </div>
            </div>
          </div>

          {/* More tools bottom sheet */}
          {showMoreTools && (
            <div className="bg-gray-900/95 backdrop-blur-md border-t border-white/10 px-3 py-3 flex flex-wrap justify-center gap-1.5 max-h-[40vh] overflow-y-auto">
              {/* Rotation controls (images only) */}
              {isImage && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setRotation(r => (r - 90 + 360) % 360); }}
                    className="flex items-center gap-1.5 px-3 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs shrink-0"
                    title="逆时针旋转 (Shift+R)"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    <span>左旋</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setRotation(r => (r + 90) % 360); }}
                    className="flex items-center gap-1.5 px-3 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs shrink-0"
                    title="顺时针旋转 (R)"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    <span>右旋</span>
                  </button>
                  {rotation !== 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setRotation(0); }}
                      className="flex items-center gap-1.5 px-3 py-2 text-blue-400 hover:text-blue-300 hover:bg-white/10 rounded-lg transition-colors text-xs shrink-0"
                      title="重置旋转"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                      <span>重置</span>
                    </button>
                  )}
                  <div className="w-px h-5 bg-white/10 mx-1 self-center" />
                </>
              )}
              {/* Panorama button (for wide images) */}
              {isImage && imageDimensions && imageDimensions.w / imageDimensions.h > 2 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowPanorama(true); setShowMoreTools(false); }}
                  className="flex items-center gap-1.5 px-3 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs shrink-0"
                  title="全景查看"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                  <span>全景</span>
                </button>
              )}
              {/* Poster upload (for videos) */}
              {isVideo && (
                <button
                  onClick={(e) => { e.stopPropagation(); posterInputRef.current?.click(); }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-xs shrink-0 ${posterUploading ? 'text-blue-400 animate-pulse' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                  title="设置视频封面"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <span>{posterUploading ? '上传中...' : '封面'}</span>
                </button>
              )}
              {isImage && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleCopyImage(); }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-xs shrink-0 ${imageCopied ? 'text-green-400' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                  title="复制图片到剪贴板"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                  <span>{imageCopied ? '已复制' : '复制图片'}</span>
                </button>
              )}
              <div className="w-px h-5 bg-white/10 mx-1 self-center" />
              {/* Copy link */}
              <button
                onClick={(e) => { e.stopPropagation(); handleCopyLink(); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-xs shrink-0 ${copied ? 'text-green-400' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                title={copied ? '已复制!' : '复制分享链接'}
              >
                {copied ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                )}
                <span>{copied ? '已复制' : '分享'}</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleCopyDirectUrl(); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-xs shrink-0 ${directUrlCopied ? 'text-green-400' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                title={directUrlCopied ? '已复制!' : '复制直链'}
              >
                {directUrlCopied ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                )}
                <span>{directUrlCopied ? '已复制' : '直链'}</span>
              </button>
              {/* Open in new tab */}
              <button
                onClick={(e) => { e.stopPropagation(); window.open(url, '_blank'); }}
                className="flex items-center gap-1.5 px-3 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs shrink-0"
                title="在新标签页打开"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                <span>打开</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleCopyFileName(); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-xs shrink-0 ${nameCopied ? 'text-green-400' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                title={nameCopied ? '已复制!' : '复制文件名 (N)'}
              >
                {nameCopied ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                )}
                <span>{nameCopied ? '已复制' : '文件名'}</span>
              </button>
              {/* Download */}
              <a
                href={url}
                download={name}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 px-3 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs shrink-0"
                title="下载 (D)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                <span>下载</span>
              </a>
              <div className="w-px h-5 bg-white/10 mx-1 self-center" />
              {/* Slideshow settings */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowSlideshowMenu(!showSlideshowMenu); setShowMoreTools(false); }}
                className="flex items-center gap-1.5 px-3 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs shrink-0"
                title="幻灯片设置"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                <span>幻灯片设置</span>
              </button>
              <div className="w-px h-5 bg-white/10 mx-1 self-center" />
              {/* Keyboard shortcuts */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowKeyboardHelp(true); setShowMoreTools(false); }}
                className="flex items-center gap-1.5 px-3 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs shrink-0"
                title="键盘快捷键 (?)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                <span>快捷键</span>
              </button>
              {onDuplicate && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDuplicate(current.path); setShowMoreTools(false); }}
                  className="flex items-center gap-1.5 px-3 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs shrink-0"
                  title="复制文件 (Ctrl+D)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  <span>复制文件</span>
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className={`absolute top-4 right-16 flex items-center gap-1 z-10 transition-opacity duration-200 ${!uiVisible && (isImage || isVideo) ? 'opacity-0 pointer-events-none' : ''}`}>
        {/* Position indicator */}
        {items.length > 1 && (
          <span className="text-white/50 text-xs font-mono mr-1 select-none whitespace-nowrap pointer-events-none" title="文件位置">
            {index + 1}<span className="text-white/30">/{items.length}</span>
          </span>
        )}
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
            {/* Zoom level percentage */}
            <span
              className="min-w-[3rem] text-center text-xs text-white/60 font-mono cursor-default select-none"
              title={isZoomed ? '点击重置缩放 (0)' : ''}
              onClick={(e) => { if (isZoomed) { e.stopPropagation(); resetZoom(); } }}
              style={{ cursor: isZoomed ? 'pointer' : 'default' }}
            >
              {Math.round(scale * 100)}%
            </span>
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

        {/* Rotation controls (images only) */}
        {isImage && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setRotation(r => (r - 90 + 360) % 360); }}
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="逆时针旋转 (Shift+R)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setRotation(r => (r + 90) % 360); }}
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="顺时针旋转 (R)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            {rotation !== 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setRotation(0); }}
                className="p-2 text-blue-400 hover:text-blue-300 hover:bg-white/10 rounded-lg transition-colors"
                title="重置旋转"
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

        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          className={`p-2 rounded-lg transition-colors ${isFullscreen ? 'text-blue-400 bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
          title={isFullscreen ? '退出全屏 (F)' : '全屏显示 (F)'}
        >
          {isFullscreen ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
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
        <div className="w-px h-5 bg-white/10 mx-1 shrink-0" />

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
        {/* Keyboard shortcuts help */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowKeyboardHelp(true); }}
          className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          title="键盘快捷键 (?)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
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
        {/* Copy direct URL */}
        <button
          onClick={(e) => { e.stopPropagation(); handleCopyDirectUrl(); }}
          className={`p-2 rounded-lg transition-colors ${directUrlCopied ? 'text-green-400' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
          title={directUrlCopied ? '已复制!' : '复制直链'}
        >
          {directUrlCopied ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </button>
        {/* Open in new tab */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          title="在新标签页打开 (Ctrl+O)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
        {/* Copy file name */}
        <button
          onClick={(e) => { e.stopPropagation(); handleCopyFileName(); }}
          className={`p-2 rounded-lg transition-colors ${nameCopied ? 'text-green-400' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
          title={nameCopied ? '已复制!' : '复制文件名 (N)'}
        >
          {nameCopied ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          )}
        </button>
        {isImage && (
          <>
            <div className="w-px h-5 bg-white/10 mx-1 shrink-0" />
            {/* Copy image data to clipboard */}
            <button
              onClick={(e) => { e.stopPropagation(); handleCopyImage(); }}
              className={`p-2 rounded-lg transition-colors ${imageCopied ? 'text-green-400' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
              title={imageCopied ? '已复制!' : '复制图片'}
            >
              {imageCopied ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              )}
            </button>
          </>
        )}
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
        {onDelete && (
          <>
            <div className="w-px h-5 bg-white/10 mx-1 shrink-0" />
            <button
              onClick={(e) => { e.stopPropagation(); handleDeleteConfirm(); }}
              disabled={deleting}
              className={`p-2 rounded-lg transition-colors ${deleting ? 'opacity-50 animate-pulse' : 'text-red-400/70 hover:text-red-400 hover:bg-red-500/10'}`}
              title="删除 (Delete)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </>
        )}
        {onDuplicate && (
          <>
            <div className="w-px h-5 bg-white/10 mx-1 shrink-0" />
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate(current.path); }}
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="复制文件 (Ctrl+D)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </>
        )}
      </div>
      )}

      {/* Zoom level indicator - clickable to reset zoom */}
      {isImage && isZoomed && (
        <button
          onClick={(e) => { e.stopPropagation(); resetZoom(); }}
          className={`absolute bottom-16 left-1/2 -translate-x-1/2 bg-black/70 text-white/80 text-xs px-3 py-1.5 rounded-full z-10 select-none transition-opacity duration-200 hover:bg-black/85 hover:text-white active:scale-95 ${isMobile && !uiVisible ? 'opacity-0' : ''}`}
        >
          {Math.round(scale * 100)}% · 拖动平移 · 点击重置
        </button>
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
          className={`absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all z-10 ${!uiVisible && (isImage || isVideo) ? 'opacity-0 pointer-events-none' : ''}`}
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
          className={`absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all z-10 ${!uiVisible && (isImage || isVideo) ? 'opacity-0 pointer-events-none' : ''}`}
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
            <span>双击放大</span>
            <span>·</span>
            <span>切换 →</span>
          </>
        )}
      </div>

      {/* Slideshow progress bar with speed indicator */}
      {slideshowPlaying && (
        <div className="absolute bottom-0 left-0 right-0 z-20">
          {/* Speed label above progress bar */}
          <div className="flex items-center justify-between px-3 pb-0.5">
            <span className="text-[10px] text-white/40 font-mono">[:,] 调速</span>
            <span className="text-[10px] text-white/60 font-mono tracking-wider">
              <span className="text-blue-400">{slideshowSpeed.toFixed(1)}s</span>
              {slideshowShuffle && <span className="text-white/30 ml-1">· 随机</span>}
              {slideshowLoop && <span className="text-white/30 ml-1">· 循环</span>}
            </span>
          </div>
          <div className="h-1 bg-white/10">
            <div
              className="h-full bg-blue-500 transition-all duration-75 ease-linear"
              style={{ width: `${Math.min(slideshowProgress, 100)}%` }}
            />
          </div>
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

      {/* Zoom level indicator — briefly appears when zooming */}
      {isImage && showZoomIndicator && isZoomed && (
        <div className="absolute bottom-4 left-4 bg-black/60 text-white/80 text-xs px-2.5 py-1 rounded-full z-10 pointer-events-none select-none transition-opacity duration-300">
          {Math.round(scale * 100)}%
        </div>
      )}

      {/* Desktop zoom hint */}
      {isImage && !isZoomed && !slideshowPlaying && (
        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 hidden md:flex items-center gap-2 text-white/20 text-xs pointer-events-none select-none transition-opacity duration-200 ${!uiVisible ? 'opacity-0' : ''}`}>
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
        {/* Skeleton gradient background — animated placeholder while image loads */}
        {isImage && !imageLoaded && (
          <div className={`absolute inset-0 bg-gradient-to-br from-gray-800/70 via-gray-900/80 to-gray-800/70 ${prefersReducedMotion ? '' : 'animate-pulse'} rounded-lg`} />
        )}

        {/* Loading spinner */}
        {isImage && !imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            {prefersReducedMotion ? (
              <div className="w-6 h-6 rounded-full border-2 border-white/30" />
            ) : (
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white/50" />
            )}
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
                  transform: `scale(${scale}) rotate(${rotation}deg) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
                  transition: isDragging.current ? 'none' : 'transform 0.15s ease-out',
                  transformOrigin: 'center center',
                }}
                draggable={false}
              />
            )}
            <img
              key={`${current.path}-retry${retryKeyRef.current}`}
              src={url}
              alt={name}
              className={`max-w-full max-h-[90vh] object-contain rounded-lg transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
              style={{
                transform: `scale(${scale}) rotate(${rotation}deg) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
                transition: isDragging.current ? 'none' : 'transform 0.15s ease-out',
                transformOrigin: 'center center',
              }}
              draggable={false}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
            {/* Crossfade out: previous image fades away as new one loads */}
            {crossfadeUrl && !prefersReducedMotion && (
              <img
                key={crossfadeUrl}
                src={crossfadeUrl}
                alt=""
                className="absolute inset-0 max-w-full max-h-[90vh] object-contain rounded-lg pointer-events-none"
                style={{
                  zIndex: 2,
                  animation: 'crossfade-out 0.35s ease-out forwards',
                }}
                onAnimationEnd={() => setCrossfadeUrl(null)}
                draggable={false}
              />
            )}
            {/* When reduced motion is preferred, hide the previous image instantly */}
            {crossfadeUrl && prefersReducedMotion && (
              <div
                className="absolute inset-0 max-w-full max-h-[90vh] object-contain rounded-lg pointer-events-none"
                style={{ zIndex: 2, backgroundColor: 'rgba(0,0,0,0.4)' }}
              />
            )}
            {/* Image error state — shows when load fails */}
            {/* Auto-retrying indicator — subtle, non-alarming banner */}
            {autoRetrying && (
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/50 backdrop-blur-[2px] z-10 select-none">
                <div className="flex items-center gap-3 px-4 py-2.5 bg-white/5 rounded-full">
                  {prefersReducedMotion ? (
                    <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  <span className="text-white/60 text-sm">加载失败，正在重试...</span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <p className="text-white/25 text-xs font-mono">3s 后自动重试</p>
                  <button
                    onClick={retryImage}
                    className="px-3 py-1 text-xs font-medium text-blue-300 hover:text-blue-200 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    立即重试
                  </button>
                </div>
              </div>
            )}
            {imageError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-lg bg-black/60 backdrop-blur-sm z-10 p-6">
                <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-center">
                  <p className="text-white/60 text-sm">图片加载失败</p>
                  <p className="text-white/40 text-xs mt-1 truncate max-w-[250px]">{name}</p>
                </div>
                <p className="text-white/30 text-xs">重试 {retryCountRef.current}/{MAX_RETRIES}</p>
                {retryCountRef.current >= MAX_RETRIES ? (
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-yellow-400/80 text-xs">已达最大重试次数</p>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-5 py-2 bg-white/10 hover:bg-white/20 text-white/80 rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      新标签页打开
                    </a>
                  </div>
                ) : (
                  <button
                    onClick={retryImage}
                    className="px-5 py-2 bg-blue-500/80 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    重试
                  </button>
                )}
              </div>
            )}
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
          <div className="flex items-center justify-center w-full h-full" onClick={(e) => e.stopPropagation()}>
            <AudioPlayer
              tracks={audioTracks}
              currentIndex={audioIndex >= 0 ? audioIndex : 0}
              onTrackChange={(i) => {
                const audioItem = items.filter(it => it.mime.startsWith('audio/'))[i];
                const absoluteIdx = items.findIndex(it => it.path === audioItem?.path);
                if (absoluteIdx >= 0) onNavigate(absoluteIdx);
              }}
              onClose={handleClose}
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
            <div className="relative w-full flex-1 rounded-lg overflow-hidden">
              {!officeLoaded && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-800/80 backdrop-blur-sm rounded-lg">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white/50 mb-4" />
                  <p className="text-white/50 text-sm">正在加载文档预览...</p>
                  <p className="text-white/30 text-xs mt-2">由 Google Docs Viewer 提供</p>
                </div>
              )}
              <iframe
                src={`https://docs.google.com/gview?url=${encodeURIComponent(directUrl)}&embedded=true`}
                className="w-full h-full rounded-lg border border-white/10 bg-white"
                title={name}
                onLoad={() => {
                  setOfficeLoaded(true);
                  if (officeLoadTimerRef.current) clearTimeout(officeLoadTimerRef.current);
                }}
                onError={() => {
                  // Iframe load failed — still hide the skeleton after a timeout
                  setTimeout(() => setOfficeLoaded(true), 2000);
                }}
              />
            </div>
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
              isMarkdown ? (
                <MarkdownEditor
                  content={textContent}
                  fileName={name}
                  saving={textSaving}
                  onSave={async (newContent: string) => {
                    if (!current) return;
                    setTextSaving(true);
                    try {
                      await saveFile(current.path, newContent);
                      setTextContent(newContent);
                      toast('success', '文件已保存');
                    } catch (e) {
                      console.error('Save failed:', e);
                      toast('error', '保存失败: ' + (e instanceof Error ? e.message : String(e)));
                    } finally {
                      setTextSaving(false);
                    }
                  }}
                />
              ) : (
                <CodeEditor
                  content={textContent}
                  fileName={name}
                  language={ext || 'text'}
                  saving={textSaving}
                  embedded
                  onSave={async (newContent: string) => {
                    if (!current) return;
                    setTextSaving(true);
                    try {
                      await saveFile(current.path, newContent);
                      setTextContent(newContent);
                      toast('success', '文件已保存');
                    } catch (e) {
                      console.error('Save failed:', e);
                      toast('error', '保存失败: ' + (e instanceof Error ? e.message : String(e)));
                    } finally {
                      setTextSaving(false);
                    }
                  }}
                  onClose={() => {}} // Lightbox handles close via backdrop click
                />
              )
            ) : textError === 'too-large' ? (
              <div className="flex items-center justify-center h-full text-white/50 px-8">
                <div className="text-center max-w-md">
                  <p className="text-base text-white/70 mb-2">文件过大，无法预览</p>
                  <p className="text-xs text-white/40 mb-4">
                    当前限制: {(() => {
                      const maxSizeStr = localStorage.getItem('codeMaxLoad');
                      const maxSize = maxSizeStr ? parseInt(maxSizeStr, 10) : 2 * 1024 * 1024;
                      return maxSize >= 1024 * 1024
                        ? Math.round(maxSize / 1024 / 1024) + 'MB'
                        : Math.round(maxSize / 1024) + 'KB';
                    })()} |
                    文件大小: {current && current.size
                      ? (current.size >= 1024 * 1024
                        ? (current.size / 1024 / 1024).toFixed(1) + 'MB'
                        : (current.size / 1024).toFixed(0) + 'KB')
                      : '未知'}
                  </p>
                  <p className="text-xs text-white/30">
                    提示: 可通过 localStorage.setItem('codeMaxLoad', 数字) 调整限制（单位字节），如 10MB 设为 10485760
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-white/40">
                {textError === 'fetch-error' ? '加载文本内容失败，请确认文件是否存在' : '无法加载文本内容'}
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

        {/* Always-visible position pill on mobile — even when UI is hidden */}
        {isImage && isMobile && items.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm text-white/70 text-xs px-2.5 py-1 rounded-full z-10 pointer-events-none select-none whitespace-nowrap">
            <span className="font-medium">{index + 1}</span>
            <span className="text-white/40 mx-1">/</span>
            <span>{items.length}</span>
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
      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-gray-900 border border-white/10 rounded-xl p-6 max-w-sm w-[90vw] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-medium text-sm">确认删除</h3>
                <p className="text-white/50 text-xs mt-0.5 break-all line-clamp-1">{name}</p>
              </div>
            </div>
            <p className="text-white/60 text-sm mb-5">此操作不可撤销，文件将被移动到回收站。</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white/80 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleDeleteExecute}
                disabled={deleting}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2 ${
                  deleting
                    ? 'bg-red-500/50 text-white/70 cursor-wait'
                    : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
              >
                {deleting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    删除中...
                  </>
                ) : (
                  '删除'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes crossfade-out{from{opacity:1}to{opacity:0}}@media (prefers-reduced-motion:reduce){@keyframes crossfade-out{from{opacity:1}to{opacity:1}}}`}</style>
    </div>
  );
}
