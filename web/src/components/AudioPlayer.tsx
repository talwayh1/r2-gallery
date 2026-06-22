import { useState, useRef, useEffect, useCallback } from 'react';
import { getFileUrl, getThumbUrl } from '../api';
import { toast } from '../hooks/useToast';

interface AudioTrack {
  name: string;
  path: string;
  artist?: string;
  album?: string;
  cover?: string;
  duration?: number;
}

interface AudioPlayerProps {
  tracks: AudioTrack[];
  currentIndex: number;
  onTrackChange: (index: number) => void;
  onClose: () => void;
  mini?: boolean;
}

export default function AudioPlayer({ tracks, currentIndex, onTrackChange, onClose, mini: initialMini = false }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('audioVolume');
    return saved ? parseFloat(saved) : 1;
  });
  const [shuffle, setShuffle] = useState(false);
  const [loop, setLoop] = useState<'none' | 'all' | 'one'>('all');
  const [playbackRate, setPlaybackRate] = useState(() => {
    const saved = localStorage.getItem('audioPlaybackRate');
    return saved ? parseFloat(saved) : 1;
  });
  const [mini, setMini] = useState(initialMini);
  const [hidden, setHidden] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [playedIndices, setPlayedIndices] = useState<Set<number>>(new Set([currentIndex]));
  const lastScrollY = useRef(0);
  // Refs to avoid stale closures in event handlers attached to <audio>
  const goNextRef = useRef<() => void>(() => {});
  const goPrevRef = useRef<() => void>(() => {});
  // Track consecutive audio errors to avoid infinite skipping on a completely broken playlist
  const trackErrorCountRef = useRef(0);
  const maxTrackErrors = 3;

  // ──────────────────────────────────────────────
  // State (declared AFTER refs to avoid TDZ issues)
  // ──────────────────────────────────────────────

  const track = tracks[currentIndex];

  // Scroll hide/show
  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      const diff = currentY - lastScrollY.current;
      if (diff > 30 && isPlaying) {
        setHidden(true);
      } else if (diff < -10) {
        setHidden(false);
      }
      lastScrollY.current = currentY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isPlaying]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleError = () => {
      trackErrorCountRef.current += 1;
      if (trackErrorCountRef.current >= maxTrackErrors) {
        toast('error', `连续 ${maxTrackErrors} 首音频加载失败，可能无法连接服务器`, 5000);
        return;
      }
      const trackName = tracks[currentIndex]?.name || '未知';
      toast('warning', `"${trackName}" 加载失败，自动跳到下一首`, 4000);
      // Reset the current track error state and auto-skip after a brief pause
      goNextRef.current();
    };
    const handleLoadedData = () => {
      // A track loaded successfully — reset consecutive error counter
      trackErrorCountRef.current = 0;
    };
    const handleEnded = () => {
      if (loop === 'one') {
        audio.currentTime = 0;
        audio.play();
      } else {
        goNextRef.current();
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('loadeddata', handleLoadedData);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('loadeddata', handleLoadedData);
    };
  }, [currentIndex, tracks.length, loop]);

  // Volume persistence
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    localStorage.setItem('audioVolume', String(volume));
  }, [volume]);

  // Playback rate persistence
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
    localStorage.setItem('audioPlaybackRate', String(playbackRate));
  }, [playbackRate]);

  // Save state to localStorage
  useEffect(() => {
    localStorage.setItem('audioPlayerState', JSON.stringify({
      currentIndex,
      shuffle,
      loop,
      playbackRate,
      mini,
    }));
  }, [currentIndex, shuffle, loop, playbackRate, mini]);

  const togglePlay = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
    }
  }, [isPlaying]);

  const getNextIndex = useCallback(() => {
    if (shuffle) {
      const unplayed = tracks.map((_, i) => i).filter(i => !playedIndices.has(i));
      if (unplayed.length === 0) {
        setPlayedIndices(new Set());
        const all = tracks.map((_, i) => i).filter(i => i !== currentIndex);
        return all.length > 0 ? all[Math.floor(Math.random() * all.length)] : currentIndex;
      }
      return unplayed[Math.floor(Math.random() * unplayed.length)];
    }
    return (currentIndex + 1) % tracks.length;
  }, [shuffle, currentIndex, tracks.length, playedIndices]);

  const getPrevIndex = useCallback(() => {
    if (shuffle) {
      const unplayed = tracks.map((_, i) => i).filter(i => !playedIndices.has(i));
      if (unplayed.length === 0) {
        setPlayedIndices(new Set());
        const all = tracks.map((_, i) => i).filter(i => i !== currentIndex);
        return all.length > 0 ? all[Math.floor(Math.random() * all.length)] : currentIndex;
      }
      return unplayed[Math.floor(Math.random() * unplayed.length)];
    }
    return (currentIndex - 1 + tracks.length) % tracks.length;
  }, [shuffle, currentIndex, tracks.length, playedIndices]);

  const goNext = useCallback(() => {
    const nextIdx = getNextIndex();
    setPlayedIndices(prev => new Set(prev).add(nextIdx));
    onTrackChange(nextIdx);
  }, [getNextIndex, onTrackChange]);

  const goPrev = useCallback(() => {
    const prevIdx = getPrevIndex();
    setPlayedIndices(prev => new Set(prev).add(prevIdx));
    onTrackChange(prevIdx);
  }, [getPrevIndex, onTrackChange]);

  // Keep refs current so event handlers in useEffect always see latest callbacks
  goNextRef.current = goNext;
  goPrevRef.current = goPrev;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const cycleLoop = () => {
    const modes: Array<'none' | 'all' | 'one'> = ['none', 'all', 'one'];
    const idx = modes.indexOf(loop);
    setLoop(modes[(idx + 1) % modes.length]);
  };

  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(playbackRate);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setPlaybackRate(next);
  };

  const formatSpeed = (rate: number) => `${rate}x`;

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (audioRef.current) {
            const t = Math.max(0, audioRef.current.currentTime - 5);
            audioRef.current.currentTime = t;
            setCurrentTime(t);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (audioRef.current) {
            const t = Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + 5);
            audioRef.current.currentTime = t;
            setCurrentTime(t);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(v => Math.min(1, v + 0.1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(v => Math.max(0, v - 0.1));
          break;
        case '>':
        case '.':
          if (e.shiftKey) {
            e.preventDefault();
            cycleSpeed();
          }
          break;
        case '<':
        case ',':
          if (e.shiftKey) {
            e.preventDefault();
            // Reverse cycle — go back one speed
            const idx = SPEEDS.indexOf(playbackRate);
            const prev = SPEEDS[(idx - 1 + SPEEDS.length) % SPEEDS.length];
            setPlaybackRate(prev);
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay]);

  if (!track) return null;

  const trackUrl = getFileUrl(track.path);
  const coverUrl = track.cover || null;

  // Mini player
  if (mini) {
    return (
      <div className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${hidden ? 'translate-y-24 opacity-0' : 'translate-y-0 opacity-100'}`}>
        <div className="bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 p-3 flex items-center gap-3 min-w-[280px]">
          <audio ref={audioRef} src={trackUrl} preload="metadata" />
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-700 flex-shrink-0">
            {coverUrl ? <img src={coverUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><svg className="w-5 h-5 text-white/50" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg></div>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-xs font-medium truncate flex items-center gap-1.5">
              {track.name}
              {playbackRate !== 1 && (
                <span className="text-[10px] text-blue-400 font-mono bg-blue-400/10 px-1 rounded shrink-0">{formatSpeed(playbackRate)}</span>
              )}
            </div>
            <div className="text-white/40 text-[10px] truncate">{track.artist || '未知艺术家'}</div>
          </div>
          <button onClick={goPrev} className="p-1.5 text-white/50 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
          </button>
          <button onClick={togglePlay} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
            {isPlaying ? (
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
            ) : (
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <button onClick={goNext} className="p-1.5 text-white/50 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
          </button>
          <button onClick={() => setMini(false)} className="p-1.5 text-white/50 hover:text-white transition-colors" title="展开">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
          </button>
          <button onClick={onClose} className="p-1.5 text-white/50 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
    );
  }

  // Full player
  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ${hidden ? 'translate-y-full' : 'translate-y-0'}`}>
      <audio ref={audioRef} src={trackUrl} preload="metadata" />

      {/* Progress bar — custom visual track with invisible range input overlay for seeking */}
      <div className="relative h-5 flex items-center cursor-pointer group"
        onMouseDown={(e) => {
          if (!audioRef.current || !duration) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const time = ratio * duration;
          audioRef.current.currentTime = time;
          setCurrentTime(time);
        }}
        onTouchMove={(e) => {
          if (!audioRef.current || !duration) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const touch = e.touches[0];
          const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
          audioRef.current.currentTime = ratio * duration;
          setCurrentTime(ratio * duration);
        }}
      >
        {/* Track background */}
        <div className="absolute left-0 right-0 h-1 rounded-full bg-gray-600 overflow-hidden">
          {/* Filled portion */}
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-[width] duration-75"
            style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
          />
        </div>
        {/* Buffer / seek preview */}
        <div className="absolute left-0 right-0 h-5 -top-2 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Hidden range input for keyboard/accessibility */}
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-5 appearance-none bg-transparent cursor-pointer opacity-0"
            aria-label="进度"
          />
        </div>
        {/* Thumb indicator */}
        {duration > 0 && (
          <div
            className="absolute w-3 h-3 bg-white rounded-full shadow-md -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />
        )}
      </div>

      <div className="bg-gray-900/95 backdrop-blur-xl border-t border-white/10 px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Album art */}
          <div className="w-14 h-14 flex-shrink-0 bg-gray-700 rounded-xl overflow-hidden">
            {coverUrl ? (
              <img src={coverUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><svg className="w-8 h-8 text-white/50" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg></div>
            )}
          </div>

          {/* Track info */}
          <div className="flex-1 min-w-0">
            <div className="text-white font-medium truncate text-sm">{track.name}</div>
            <div className="text-white/50 text-xs truncate">{track.artist || '未知艺术家'}{track.album ? ` · ${track.album}` : ''}</div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button onClick={() => setShuffle(!shuffle)} className={`p-2 rounded-full transition-colors ${shuffle ? 'text-blue-400 bg-blue-400/10' : 'text-white/40 hover:text-white'}`} title="随机播放">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" /></svg>
            </button>
            <button onClick={goPrev} className="p-2 text-white/50 hover:text-white transition-colors" title="上一首">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
            </button>
            <button onClick={togglePlay} className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
              {isPlaying ? (
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              ) : (
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <button onClick={goNext} className="p-2 text-white/50 hover:text-white transition-colors" title="下一首">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>
            <button onClick={cycleLoop} className={`p-2 rounded-full transition-colors ${loop !== 'none' ? 'text-blue-400 bg-blue-400/10' : 'text-white/40 hover:text-white'}`} title={loop === 'none' ? '关闭循环' : loop === 'all' ? '列表循环' : '单曲循环'}>
              {loop === 'one' ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" /><text x="12" y="15" textAnchor="middle" fontSize="7" fill="currentColor">1</text></svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" /></svg>
              )}
            </button>
            <button onClick={cycleSpeed} className={`p-1.5 rounded-full transition-colors text-xs font-mono ${playbackRate !== 1 ? 'text-blue-400 bg-blue-400/10' : 'text-white/40 hover:text-white'}`} title={`播放速度: ${formatSpeed(playbackRate)}`}>
              {formatSpeed(playbackRate)}
            </button>
          </div>

          {/* Time */}
          <div className="text-xs text-white/40 w-24 text-right font-mono">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2">
            <button onClick={() => setVolume(volume === 0 ? 1 : 0)} className="text-white/40 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                {volume === 0 ? (
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                ) : volume < 0.5 ? (
                  <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
                ) : (
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                )}
              </svg>
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-20 h-1 appearance-none bg-gray-600 rounded cursor-pointer"
            />
          </div>

          {/* Track count */}
          <button onClick={() => setShowPlaylist(!showPlaylist)} className="text-xs text-white/40 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10" title="播放列表">
            {currentIndex + 1} / {tracks.length}
          </button>

          {/* Mini toggle */}
          <button onClick={() => setMini(true)} className="p-2 text-white/40 hover:text-white transition-colors" title="迷你模式">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
          </button>

          {/* Close */}
          <button onClick={onClose} className="p-2 text-white/40 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {/* Playlist panel */}
      {showPlaylist && (
        <div className="absolute bottom-full left-0 right-0 max-h-[40vh] overflow-y-auto bg-gray-900/95 backdrop-blur-xl border-t border-white/10">
          <div className="p-2">
            {tracks.map((t, i) => (
              <button
                key={t.path}
                onClick={() => { onTrackChange(i); setShowPlaylist(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  i === currentIndex ? 'bg-blue-500/20 text-blue-400' : 'text-white/70 hover:bg-white/5'
                }`}
              >
                <span className="text-xs text-white/30 w-6 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{t.name}</div>
                  {t.artist && <div className="text-xs text-white/40 truncate">{t.artist}</div>}
                </div>
                {i === currentIndex && isPlaying && (
                  <div className="flex items-center gap-0.5">
                    <div className="w-1 h-3 bg-blue-400 animate-pulse rounded-full" />
                    <div className="w-1 h-4 bg-blue-400 animate-pulse rounded-full" style={{ animationDelay: '0.15s' }} />
                    <div className="w-1 h-2 bg-blue-400 animate-pulse rounded-full" style={{ animationDelay: '0.3s' }} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
