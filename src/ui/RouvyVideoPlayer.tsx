import { useEffect, useRef, useState } from 'react';
import { Film, MapPin, Maximize2, Minimize2, Tv } from 'lucide-react';
import { parseYouTubeVideoId } from '../media/youtube';
import type { RideTelemetry } from '../simulation/rideEngine';

export interface PresetVideo {
  id: string;
  name: string;
  location: string;
  youtubeId: string;
}

export const ROUVY_PRESET_VIDEOS: PresetVideo[] = [
  {
    id: 'alpe-dhuez',
    name: "Alpe d'Huez Climb 4K",
    location: 'French Alps (21 Hairpins)',
    youtubeId: 'qjA5u2H-gY0',
  },
  {
    id: 'stelvio-pass',
    name: 'Stelvio Pass Alpine Climb',
    location: 'Italian Alps (2758m)',
    youtubeId: '3uY0M4_K008',
  },
  {
    id: 'nice-coast',
    name: 'Nice Promenade & Coastal Ride',
    location: 'French Riviera',
    youtubeId: 'N17b-_rMv_c',
  },
  {
    id: 'tuscany-gravel',
    name: 'Tuscany Eroica Gravel Route',
    location: 'Siena, Italy',
    youtubeId: '7R47VjP0Jvw',
  },
];

interface Props {
  telemetry: RideTelemetry;
  url: string;
  onUrlChange: (url: string) => void;
  pipMapNode?: React.ReactNode;
}

export function RouvyVideoPlayer({ telemetry, url, onUrlChange, pipMapNode }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [showPipMap, setShowPipMap] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState<string>('alpe-dhuez');

  const activeVideoId = parseYouTubeVideoId(url) || ROUVY_PRESET_VIDEOS.find((v) => v.id === selectedPreset)?.youtubeId || ROUVY_PRESET_VIDEOS[0].youtubeId;
  const isDirectVideoUrl = url.endsWith('.mp4') || url.endsWith('.webm') || url.endsWith('.m3u8');

  const isRiding = telemetry.phase === 'riding';
  const speedKmh = telemetry.speedKmh;

  // Sync YouTube / HTML5 video playback with rider speed
  useEffect(() => {
    // 1. HTML5 direct video element sync
    if (videoRef.current) {
      const vid = videoRef.current;
      if (!isRiding || speedKmh < 0.5) {
        vid.pause();
      } else {
        // Base speed 25 km/h = 1.0x rate. Clamp between 0.3x and 2.5x.
        const rate = Math.max(0.3, Math.min(2.5, speedKmh / 25));
        vid.playbackRate = rate;
        void vid.play().catch(() => {});
      }
      return;
    }

    // 2. YouTube iframe postMessage API sync
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;

    try {
      if (!isRiding || speedKmh < 0.5) {
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*');
      } else {
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
        
        // Nearest valid YouTube playback rate: 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2
        const rawRate = speedKmh / 25;
        const rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
        const closestRate = rates.reduce((prev, curr) => (Math.abs(curr - rawRate) < Math.abs(prev - rawRate) ? curr : prev));
        
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [closestRate] }),
          '*',
        );
      }
    } catch {
      // Ignore cross-origin postMessage restrictions
    }
  }, [isRiding, speedKmh]);

  const handleSelectPreset = (preset: PresetVideo) => {
    setSelectedPreset(preset.id);
    onUrlChange(preset.youtubeId);
  };

  return (
    <div className="rouvy-video-container">
      {/* Real Road Video Player Background */}
      <div className="rouvy-video-viewport">
        {isDirectVideoUrl ? (
          <video
            ref={videoRef}
            src={url}
            className="rouvy-video-element"
            playsInline
            loop
            muted
          />
        ) : (
          <iframe
            ref={iframeRef}
            key={activeVideoId}
            src={`https://www.youtube.com/embed/${activeVideoId}?enablejsapi=1&autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1`}
            title="Rouvy AR Road Video"
            className="rouvy-iframe-element"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        )}
      </div>

      {/* Floating Toolbar & Video Selector */}
      <div className="rouvy-video-toolbar">
        <div className="rouvy-preset-chips">
          {ROUVY_PRESET_VIDEOS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`btn btn-xs ${activeVideoId === preset.youtubeId ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleSelectPreset(preset)}
            >
              <Tv className="icon-xs mr-1" />
              {preset.name}
            </button>
          ))}
        </div>
        <div className="rouvy-url-box">
          <Film className="icon-xs text-cyan" />
          <input
            type="url"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="Custom YouTube / Video URL..."
            className="rouvy-url-input"
          />
        </div>
      </div>

      {/* PiP Mini GPS Map Overlay (Corner) */}
      {pipMapNode && (
        <div className={`rouvy-pip-map ${showPipMap ? 'rouvy-pip-open' : 'rouvy-pip-collapsed'}`}>
          <div className="rouvy-pip-header">
            <span className="rouvy-pip-title">
              <MapPin className="icon-xs text-cyan" /> GPS Route Map
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setShowPipMap(!showPipMap)}
            >
              {showPipMap ? <Minimize2 className="icon-xs" /> : <Maximize2 className="icon-xs" />}
            </button>
          </div>
          {showPipMap && <div className="rouvy-pip-content">{pipMapNode}</div>}
        </div>
      )}
    </div>
  );
}
