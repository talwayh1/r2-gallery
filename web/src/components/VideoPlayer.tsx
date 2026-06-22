import { useEffect, useRef, useState } from 'react';
import { getFileUrl, getThumbUrl } from '../api';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface Props {
  path: string;
  name: string;
  autoplay?: boolean;
  loop?: boolean;
  onEnded?: () => void;
}

export default function VideoPlayer({ path, name, autoplay = true, loop = false, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const url = getFileUrl(path);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onLoadedMetadata = () => setDuration(video.duration);
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

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
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
  };

  const showControlsWithTimer = () => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3000);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const startPos = touchStartPosRef.current;
    touchStartPosRef.current = null;
    if (!startPos) return;
    const touch = e.changedTouches[0];
    const dx = Math.abs(touch.clientX - startPos.x);
    const dy = Math.abs(touch.clientY - startPos.y);
    // Only treat as a tap if finger moved less than 15px (ignore swipes/scrolling)
    if (dx < 15 && dy < 15) {
      showControlsWithTimer();
    }
  };

  const SEEK_STEP = 5;
  const VOLUME_STEP = 0.1;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const video = videoRef.current;
    if (!video) return;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - SEEK_STEP);
        showControlsWithTimer();
        break;
      case 'ArrowRight':
        e.preventDefault();
        video.currentTime = Math.min(duration, video.currentTime + SEEK_STEP);
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
        {/* Progress bar */}
        <div className="relative h-1.5 bg-white/20 rounded-full cursor-pointer group/progress mb-3" onClick={seek}>
          {/* Buffered */}
          <div
            className="absolute h-full bg-white/20 rounded-full"
            style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }}
          />
          {/* Progress */}
          <div
            className="absolute h-full bg-blue-500 rounded-full"
            style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
          />
          {/* Hover indicator */}
          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-500 opacity-0 group-hover/progress:opacity-100 transition-opacity shadow-md"
            style={{ left: `calc(${duration ? (currentTime / duration) * 100 : 0}% - 6px)` }}
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
    </div>
  );
}
