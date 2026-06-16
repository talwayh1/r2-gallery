import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

interface Props {
  src: string;
  autoplay?: boolean;
  onEnded?: () => void;
}

export default function HlsPlayer({ src, autoplay = true, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (src.includes('.m3u8') && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (autoplay) video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setError(`HLS error: ${data.type}`);
        }
      });
      return () => { hls.destroy(); };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari)
      video.src = src;
    } else {
      setError('HLS not supported in this browser');
    }
  }, [src, autoplay]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 bg-gray-900/80 rounded-xl text-white/60">
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm">{error}</p>
        <a href={src} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-sm hover:underline">打开原始链接</a>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      controls
      autoPlay={autoplay}
      playsInline
      onEnded={onEnded}
      className="max-w-full max-h-[85vh] rounded-lg"
    />
  );
}
