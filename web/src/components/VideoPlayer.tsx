import { useEffect, useRef, useState, useCallback } from 'react';
import { getFileUrl, getThumbUrl } from '../api';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SEEK_STEP = 10;
const VOLUME_STEP = 0.1;
const DOUBLE_TAP_THRESHOLD_MS = 300;
const DOUBLE_TAP_MAX_DIST_PX = 40;

interface VideoMetadata {
  duration: number;
  videoWidth: number;
  videoHeight: number;
}

interface Props {
  path: string;
  name: string;
  autoplay?: boolean;
  loop?: boolean;
  onEnded?: () => void;
  onMetadata?: (meta: VideoMetadata) => void;
}

export default function VideoPlayer({ path, name, autoplay = true, loop = false, onEnded, onMetadata }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('videoVolume');
    return saved ? parseFloat(saved) : 1;
  });
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(() => {
    const saved = localStorage.getItem('videoPlaybackRate');
    return saved ? parseFloat(saved) : 1;
  });
  const [showControls, setShowControls] = useState(true);
  const [buffered, setBuffered] = useState(0);
  const [pipSupported] = useState(() => typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled);
  const [pipActive, setPipActive] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [seekHint, setSeekHint] = useState<'left' | 'right' | null>(null);
  const seekHintTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const showSeekHint = useCallback((dir: 'left' | 'right') => {
    setSeekHint(dir);
    if (seekHintTimerRef.current) clearTimeout(seekHintTimerRef.current);
    seekHintTimerRef.current = setTimeout(() => setSeekHint(null), 500);
  }, []);

  const [showShortcutHint, setShowShortcutHint] = useState(() => {
    return typeof window !== 'undefined' && !localStorage.getItem('videoShortcutHintDismissed');
  });
  const SHORTCUT_HINT_DURATION = 4000;
  const url = getFileUrl(path);

  // --- Double-tap seek state (YouTube-style) ---
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);
  const [doubleTapSeekDir, setDoubleTapSeekDir] = useState<'left' | 'right' | null>(null);
  const doubleTapAnimTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // --- Progress bar drag state ---
  const isDraggingProgress = useRef(false);

  // --- Seek helpers ---
  const doSeek = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + delta));
    showControlsWithTimer();
  }, [duration]);

  const seekToRatio = useCallback((ratio: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const target = Math.max(0, Math.min(duration, ratio * duration));
    video.currentTime = target;
  }, [duration]);

  // --- Double-tap seek handler (mobile) ---
  const handleDoubleTapSeek = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container || !duration) return;
    const rect = container.getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width;
    let dir: 'left' | 'right';
    if (relX < 0.3) {
      dir = 'left';
      doSeek(-SEEK_STEP);
    } else if (relX > 0.7) {
      dir = 'right';
      doSeek(SEEK_STEP);
    } else {
      return; // center tap — not a seek zone
    }
    // Animate overlay
    setDoubleTapSeekDir(dir);
    if (doubleTapAnimTimerRef.current) clearTimeout(doubleTapAnimTimerRef.current);
    doubleTapAnimTimerRef.current = setTimeout(() => setDoubleTapSeekDir(null), 400);
  }, [duration, doSeek]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onLoadedMetadata = () => {
      setDuration(video.duration);
      onMetadata?.({
        duration: video.duration,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEndedHandler = () => { setPlaying(false); onEnded?.(); };
    const onEnterPip = () => setPipActive(true);
    const onLeavePip = () => setPipActive(false);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEndedHandler);
    video.addEventListener('enterpictureinpicture', onEnterPip);
    video.addEventListener('leavepictureinpicture', onLeavePip);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEndedHandler);
      video.removeEventListener('enterpictureinpicture', onEnterPip);
      video.removeEventListener('leavepictureinpicture', onLeavePip);
    };
  }, [onEnded]);

  // Sync volume to video element and persist to localStorage
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    localStorage.setItem('videoVolume', String(volume));
  }, [volume]);

  // Sync playback rate to video element and persist to localStorage
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
    localStorage.setItem('videoPlaybackRate', String(playbackRate));
  }, [playbackRate]);

  // Close speed menu when controls auto-hide
  useEffect(() => {
    if (!showControls) setSpeedMenuOpen(false);
  }, [showControls]);

  // Auto-dismiss shortcut hint after SHORTCUT_HINT_DURATION ms
  useEffect(() => {
    if (!showShortcutHint) return;
    const timer = setTimeout(() => {
      setShowShortcutHint(false);
      try { localStorage.setItem('videoShortcutHintDismissed', '1'); } catch {}
    }, SHORTCUT_HINT_DURATION);
    return () => clearTimeout(timer);
  }, [showShortcutHint]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
    dismissShortcutHint();
  };

  const dismissShortcutHint = () => {
    if (showShortcutHint) {
      setShowShortcutHint(false);
      try { localStorage.setItem('videoShortcutHintDismissed', '1'); } catch {}
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = ratio * duration;
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const val = parseFloat(e.target.value);
    video.volume = val;
    setVolume(val);
    if (val === 0) { video.muted = true; setMuted(true); }
    else if (video.muted) { video.muted = false; setMuted(false); }
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen();
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP failed:', err);
    }
  };

  const handleMouseMove = () => {
    showControlsWithTimer();
    dismissShortcutHint();
  };

  const showControlsWithTimer = () => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3000);
  };

  // --- Touch handlers for video container (double-tap seek + tap-to-toggle) ---
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const now = Date.now();
    const last = lastTapRef.current;

    // Check for double tap
    if (
      last &&
      now - last.time < DOUBLE_TAP_THRESHOLD_MS &&
      Math.abs(touch.clientX - last.x) < DOUBLE_TAP_MAX_DIST_PX
    ) {
      // Double tap detected — seek at current position
      e.preventDefault();
      handleDoubleTapSeek(touch.clientX);
      lastTapRef.current = null; // consume so no triple-tap
      return;
    }

    // Store first tap
    lastTapRef.current = { time: now, x: touch.clientX };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    showControlsWithTimer();
  };

  // --- Touch-draggable progress bar ---
  const getTouchRatio = (clientX: number): number => {
    const bar = progressBarRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handleProgressTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    isDraggingProgress.current = true;
    const ratio = getTouchRatio(e.touches[0].clientX);
    seekToRatio(ratio);
    showControlsWithTimer();
  };

  const handleProgressTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingProgress.current) return;
    e.preventDefault();
    e.stopPropagation();
    const ratio = getTouchRatio(e.touches[0].clientX);
    seekToRatio(ratio);
  };

  const handleProgressTouchEnd = (e: React.TouchEvent) => {
    if (!isDraggingProgress.current) return;
    isDraggingProgress.current = false;
    e.stopPropagation();
    const ratio = getTouchRatio(e.changedTouches[0].clientX);
    seekToRatio(ratio);
    showControlsWithTimer();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const video = videoRef.current;
    if (!video) return;

    dismissShortcutHint();

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - SEEK_STEP);
        showSeekHint('left');
        showControlsWithTimer();
        break;
      case 'ArrowRight':
        e.preventDefault();
        video.currentTime = Math.min(duration, video.currentTime + SEEK_STEP);
        showSeekHint('right');
        showControlsWithTimer();
        break;
      case 'ArrowUp':
        e.preventDefault();
        setVolume(v => Math.min(1, v + VOLUME_STEP));
        showControlsWithTimer();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setVolume(v => Math.max(0, v - VOLUME_STEP));
        showControlsWithTimer();
        break;
      case ' ':
        e.preventDefault();
        togglePlay();
        showControlsWithTimer();
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'm':
      case 'M':
        e.preventDefault();
        toggleMute();
        showControlsWithTimer();
        break;
    }
  };

  const formatTime = (s: number) => {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progressPct = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative group bg-black rounded-lg overflow-hidden focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setShowControls(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <video
        ref={videoRef}
        src={url}
        poster={getThumbUrl(path)}
        className="w-full max-h-[85vh] cursor-pointer"
        autoPlay={autoplay}
        loop={loop}
        playsInline
        preload="metadata"
        onClick={togglePlay}
      />

      {/* YouTube-style double-tap seek overlay — only render the active side */}
      {doubleTapSeekDir && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className={`absolute inset-y-0 ${doubleTapSeekDir === 'left' ? 'left-0' : 'right-0'} w-[30%] flex items-center justify-center`}>
            <div className="opacity-100 scale-100 transition-all duration-300">
              <div className="relative flex flex-col items-center gap-1">
                <div className="bg-black/60 backdrop-blur-sm rounded-full w-16 h-16 flex items-center justify-center">
                  {doubleTapSeekDir === 'left' ? (
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
                <span className="text-white font-bold text-sm bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-full">
                  {doubleTapSeekDir === 'left' ? '-' : '+'}{SEEK_STEP}s
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Seek hint overlay — brief arrow indicating tap-to-seek direction with seconds */}
      <div
        className={`absolute inset-0 flex items-center justify-center pointer-events-none z-10 transition-opacity duration-500 ${
          seekHint ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className={`flex flex-col items-center gap-1 transition-all duration-300 ${
          seekHint === 'left' ? 'ml-[-30px]' : 'mr-[-30px]'
        }`}>
          <div className="bg-black/50 backdrop-blur-sm rounded-full w-14 h-14 flex items-center justify-center">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={seekHint === 'left' ? "M11 19l-7-7 7-7m8 14l-7-7 7-7" : "M13 5l7 7-7 7M5 5l7 7-7 7"} />
            </svg>
          </div>
          <span className="text-white/90 text-xs font-mono font-bold bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded-full">
            {seekHint === 'left' ? '-10s' : '+10s'}
          </span>
        </div>
      </div>

      {/* Big play button overlay when paused */}
      {!playing && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity"
        >
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors">
            <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </button>
      )}

      {/* Controls bar */}
      <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-8 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* Progress bar — supports both click and touch drag */}
        <div
          ref={progressBarRef}
          className="relative h-1.5 bg-white/20 rounded-full cursor-pointer group/progress mb-3 touch-pan-y"
          onClick={seek}
          onTouchStart={handleProgressTouchStart}
          onTouchMove={handleProgressTouchMove}
          onTouchEnd={handleProgressTouchEnd}
        >
          {/* Buffered */}
          <div
            className="absolute h-full bg-white/20 rounded-full"
            style={{ width: `${bufferedPct}%` }}
          />
          {/* Progress */}
          <div
            className="absolute h-full bg-blue-500 rounded-full"
            style={{ width: `${progressPct}%` }}
          />
          {/* Draggable thumb — always visible on touch, hover on desktop */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-500 opacity-0 group-hover/progress:opacity-100 progress-thumb-touch transition-opacity shadow-md"
            style={{ left: `calc(${progressPct}% - 6px)` }}
          />
        </div>

        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button onClick={togglePlay} className="text-white hover:text-blue-400 transition-colors">
            {playing ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>

          {/* Time */}
          <span className="text-white/80 text-xs font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span>

          <div className="flex-1" />

          {/* PiP button */}
          {pipSupported && (
            <button onClick={togglePiP} className={`transition-colors ${pipActive ? 'text-blue-400' : 'text-white/70 hover:text-white'}`} title={pipActive ? '退出画中画' : '画中画'}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM11 9h4v4h-4V9z" />
              </svg>
            </button>
          )}

          {/* Playback speed */}
          <div className="relative">
            <button
              onClick={() => setSpeedMenuOpen(!speedMenuOpen)}
              className="text-white/70 hover:text-white transition-colors text-xs font-mono font-bold px-1.5 py-0.5 rounded hover:bg-white/10"
              title="播放速度"
            >
              {playbackRate}x
            </button>
            {speedMenuOpen && (
              <div
                className="absolute bottom-full right-0 mb-2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden"
                onMouseLeave={() => setSpeedMenuOpen(false)}
              >
                {SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => { setPlaybackRate(speed); setSpeedMenuOpen(false); }}
                    className={`block w-full text-left px-4 py-2 text-sm whitespace-nowrap hover:bg-white/10 transition-colors ${
                      speed === playbackRate ? 'text-blue-400 font-medium' : 'text-white/80'
                    }`}
                  >
                    {speed}x
                    {speed === 1 && <span className="ml-2 text-xs text-gray-500">正常</span>}
                    {speed === playbackRate && <span className="ml-2 text-blue-400">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Volume */}
          <button onClick={toggleMute} className="text-white/70 hover:text-white transition-colors">
            {muted || volume === 0 ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
            ) : volume < 0.5 ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={muted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-16 h-1 accent-blue-500 cursor-pointer"
          />

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} className="text-white/70 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
          </button>
        </div>
      </div>

      {/* File name */}
      <div className={`absolute top-3 left-3 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        <span className="text-white/80 text-sm font-medium bg-black/50 px-2 py-1 rounded backdrop-blur-sm">{name}</span>
      </div>

      {/* Speed badge — always visible when playback rate ≠ 1 */}
      {playbackRate !== 1 && (
        <div className="absolute top-3 right-3 pointer-events-none select-none">
          <span className="text-blue-400 text-xs font-mono font-bold bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded-md shadow-lg border border-blue-500/30">
            {playbackRate}x
          </span>
        </div>
      )}

      {/* Keyboard shortcut hint — shows briefly on first interaction */}
      <div
        className={`absolute bottom-16 left-1/2 -translate-x-1/2 pointer-events-none select-none transition-all duration-500 ${
          showShortcutHint ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        <div className="bg-black/70 backdrop-blur-md rounded-xl border border-white/10 px-3 py-2 shadow-2xl">
          <div className="flex items-center gap-3 text-[11px] text-white/70 whitespace-nowrap">
            <span className="flex items-center gap-1">
              <kbd className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono bg-white/10 rounded border border-white/20">Space</kbd>
              <span>播放</span>
            </span>
            <span className="text-white/20">|</span>
            <span className="flex items-center gap-1">
              <kbd className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono bg-white/10 rounded border border-white/20">←</kbd>
              <kbd className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono bg-white/10 rounded border border-white/20">→</kbd>
              <span>进退</span>
            </span>
            <span className="text-white/20">|</span>
            <span className="flex items-center gap-1">
              <kbd className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono bg-white/10 rounded border border-white/20">↑</kbd>
              <kbd className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono bg-white/10 rounded border border-white/20">↓</kbd>
              <span>音量</span>
            </span>
            <span className="text-white/20">|</span>
            <span className="flex items-center gap-1">
              <kbd className="inline-flex items-center justify-center w-6 h-5 text-[10px] font-mono bg-white/10 rounded border border-white/20">F</kbd>
              <span>全屏</span>
            </span>
            <span className="text-white/20">|</span>
            <span className="flex items-center gap-1">
              <kbd className="inline-flex items-center justify-center w-6 h-5 text-[10px] font-mono bg-white/10 rounded border border-white/20">M</kbd>
              <span>静音</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
