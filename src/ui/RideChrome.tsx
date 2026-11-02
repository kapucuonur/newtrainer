import type { RidePhase } from '../simulation/rideEngine';
import { useT } from '../i18n';
import { Camera, Film, Pause, Play, Route, Square } from 'lucide-react';

type Props = {
  phase: RidePhase;
  routePeekOpen: boolean;
  videoPanelOpen: boolean;
  streetViewOn: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onToggleRoutePeek: () => void;
  onToggleVideo: () => void;
  /** Omitted when no street imagery source is configured. */
  onToggleStreetView?: () => void;
};

export function RideChrome({
  phase,
  routePeekOpen,
  videoPanelOpen,
  streetViewOn,
  onPause,
  onResume,
  onStop,
  onToggleRoutePeek,
  onToggleVideo,
  onToggleStreetView,
}: Props) {
  const t = useT();

  return (
    <div className="ride-chrome" role="toolbar" aria-label={t('ride.chromeAria')}>
      {phase === 'riding' && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onPause}
          aria-label={t('route.pause')}
        >
          <Pause className="icon-xs" aria-hidden="true" />
          <span className="ride-chrome-label">{t('route.pause')}</span>
        </button>
      )}
      {phase === 'paused' && (
        <button
          type="button"
          className="btn btn-accent btn-glow"
          onClick={onResume}
          aria-label={t('route.resume')}
        >
          <Play className="icon-xs" aria-hidden="true" />
          <span className="ride-chrome-label">{t('route.resume')}</span>
        </button>
      )}
      <button type="button" className="btn btn-danger" onClick={onStop} aria-label={t('route.stop')}>
        <Square className="icon-xs" aria-hidden="true" />
        <span className="ride-chrome-label">{t('route.stop')}</span>
      </button>
      <button
        type="button"
        className={`btn ${routePeekOpen ? 'btn-primary' : 'btn-ghost'}`}
        onClick={onToggleRoutePeek}
        aria-pressed={routePeekOpen}
        aria-label={routePeekOpen ? t('route.hidePanel') : t('route.showPanel')}
        title={routePeekOpen ? t('route.hidePanel') : t('route.showPanel')}
      >
        <Route className="icon-xs" aria-hidden="true" />
        <span className="ride-chrome-label">
          {routePeekOpen ? t('route.hidePanel') : t('route.showPanel')}
        </span>
      </button>
      <button
        type="button"
        className={`btn ${videoPanelOpen ? 'btn-accent' : 'btn-ghost'}`}
        onClick={onToggleVideo}
        aria-pressed={videoPanelOpen}
        aria-label={t('video.toggle')}
        title={t('video.toggle')}
      >
        <Film className="icon-xs" aria-hidden="true" />
        <span className="ride-chrome-label">{t('video.toggle')}</span>
      </button>
      {onToggleStreetView && (
        <button
          type="button"
          className={`btn ${streetViewOn ? 'btn-accent' : 'btn-ghost'}`}
          onClick={onToggleStreetView}
          aria-pressed={streetViewOn}
          aria-label={t('street.toggle')}
          title={t('street.toggle')}
        >
          <Camera className="icon-xs" aria-hidden="true" />
          <span className="ride-chrome-label">{t('street.toggle')}</span>
        </button>
      )}
    </div>
  );
}
