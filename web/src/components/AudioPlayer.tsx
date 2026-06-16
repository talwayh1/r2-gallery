import React, { useState, useRef, useEffect, useCallback } from 'react';

interface AudioTrack {
  name: string;
  url: string;
  artist?: string;
  album?: string;
  cover?: string;
}

interface AudioPlayerProps {
  tracks: AudioTrack[];
  currentIndex: number;
  onTrackChange: (index: number) => void;
  onClose: () => void;
}

export default function AudioPlayer({ tracks, currentIndex, onTrackChange, onClose }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  const track = tracks[currentIndex];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      if (currentIndex < tracks.length - 1) {
        onTrackChange(currentIndex + 1);
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentIndex, tracks.length, onTrackChange]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const togglePlay = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
    }
  }, [isPlaying]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    setCurrentTime(time);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!track) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white z-50 shadow-2xl">
      <audio ref={audioRef} src={track.url} preload="metadata" />
      
      {/* Progress bar */}
      <div className="h-1 bg-gray-700">
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1 appearance-none bg-blue-500 cursor-pointer"
          style={{ background: `linear-gradient(to right, #3b82f6 ${(currentTime / (duration || 1)) * 100}%, #374151 ${(currentTime / (duration || 1)) * 100}%)` }}
        />
      </div>

      <div className="flex items-center gap-4 px-4 py-3">
        {/* Album art */}
        <div className="w-12 h-12 flex-shrink-0 bg-gray-700 rounded-lg overflow-hidden">
          {track.cover ? (
            <img src={track.cover} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl">🎵</div>
          )}
        </div>

        {/* Track info */}
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{track.name}</div>
          <div className="text-sm text-gray-400 truncate">{track.artist || 'Unknown Artist'}</div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onTrackChange(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
            className="p-2 hover:bg-gray-700 rounded-full disabled:opacity-30 transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>
          
          <button
            onClick={togglePlay}
            className="p-3 bg-blue-500 hover:bg-blue-600 rounded-full transition-colors"
          >
            {isPlaying ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button
            onClick={() => onTrackChange(Math.min(tracks.length - 1, currentIndex + 1))}
            disabled={currentIndex === tracks.length - 1}
            className="p-2 hover:bg-gray-700 rounded-full disabled:opacity-30 transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
        </div>

        {/* Time */}
        <div className="text-sm text-gray-400 w-24 text-right">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
          </svg>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-20 h-1 appearance-none bg-gray-600 rounded cursor-pointer"
          />
        </div>

        {/* Track count */}
        <div className="text-xs text-gray-500">
          {currentIndex + 1} / {tracks.length}
        </div>

        {/* Close */}
        <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-full transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
