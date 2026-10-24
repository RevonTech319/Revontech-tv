import { RefObject, useCallback, useEffect, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Minimize2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface PlayerControlsProps {
  videoRef: RefObject<HTMLVideoElement>;
  containerRef: RefObject<HTMLDivElement>;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  visible: boolean;
}

/**
 * Custom bottom control bar for the video player. Replaces the native
 * `<video controls>` UI so that everything (labels, tooltips, sliders)
 * respects the app's current language and glass theme.
 *
 * We deliberately omit a seek bar — the streams are live TV and seeking is
 * either unsupported or meaningless. Play/pause, mute, volume slider, and
 * fullscreen are the essentials.
 */
export default function PlayerControls({
  videoRef,
  containerRef: _containerRef,
  isFullscreen,
  onToggleFullscreen,
  visible,
}: PlayerControlsProps) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  // Sync local state with the underlying video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onVolumeChange = () => {
      setMuted(video.muted);
      setVolume(video.volume);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('volumechange', onVolumeChange);

    // Initial sync
    setPlaying(!video.paused);
    setMuted(video.muted);
    setVolume(video.volume);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('volumechange', onVolumeChange);
    };
  }, [videoRef]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [videoRef]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, [videoRef]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const v = Number(e.target.value);
    video.volume = v;
    if (v > 0 && video.muted) video.muted = false;
  };

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 flex items-center gap-2 md:gap-3 px-3 md:px-4 py-3 bg-gradient-to-t from-black/85 via-black/50 to-transparent z-30 transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Play / Pause */}
      <button
        type="button"
        onClick={togglePlay}
        className="p-2 rounded-xl glass press tap-safe text-white"
        aria-label={playing ? t('pause') : t('play')}
      >
        {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
      </button>

      {/* Mute + Volume (volume slider hidden on very small mobile) */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleMute}
          className="p-2 rounded-xl glass press tap-safe text-white"
          aria-label={muted ? t('unmute') : t('mute')}
        >
          {muted || volume === 0 ? (
            <VolumeX className="w-5 h-5" />
          ) : (
            <Volume2 className="w-5 h-5" />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={handleVolumeChange}
          aria-label={t('volume')}
          className="hidden sm:block w-20 md:w-24 accent-primary cursor-pointer"
        />
      </div>

      <div className="flex-1" />

      {/* Fullscreen toggle */}
      <button
        type="button"
        onClick={onToggleFullscreen}
        className="p-2 rounded-xl glass press tap-safe text-white"
        aria-label={isFullscreen ? t('exit_fullscreen') : t('fullscreen')}
      >
        {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
      </button>
    </div>
  );
}
