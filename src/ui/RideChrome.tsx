import type { RidePhase } from '../simulation/rideEngine';
import { useT } from '../i18n';
import { Film, Pause, Play, Route, Square } from 'lucide-react';

type Props = {
  phase: RidePhase;
  routePeekOpen: boolean;
  videoPanelOpen: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onToggleRoutePeek: () => void;
  onToggleVideo: () => void;
};

export function RideChrome({
  phase,
  routePeekOpen,
  videoPanelOpen,
  onPause,
  onResume,
  onStop,
  onToggleRoutePeek,
  onToggleVideo,
}: Props) {
  const t = useT();

  return (
    <div className="ride-chrome" role="toolbar" aria-label={t('ride.chromeAria')}>
      {phase === 'riding' && (
        <button type="button" className="btn btn-secondary" onClick={onPause}>
          <Pause className="icon-xs" />
          {t('route.pause')}
        </button>
      )}
      {phase === 'paused' && (
        <button type="button" className="btn btn-accent btn-glow" onClick={onResume}>
          <Play className="icon-xs" />
          {t('route.resume')}
        </button>
      )}
      <button type="button" className="btn btn-danger" onClick={onStop}>
        <Square className="icon-xs" />
        {t('route.stop')}
      </button>
      <button
        type="button"
        className={`btn ${routePeekOpen ? 'btn-primary' : 'btn-ghost'}`}
        onClick={onToggleRoutePeek}
        aria-pressed={routePeekOpen}
        title={routePeekOpen ? t('route.hidePanel') : t('route.showPanel')}
      >
        <Route className="icon-xs" />
        {routePeekOpen ? t('route.hidePanel') : t('route.showPanel')}
      </button>
      <button
        type="button"
        className={`btn ${videoPanelOpen ? 'btn-accent' : 'btn-ghost'}`}
        onClick={onToggleVideo}
        aria-pressed={videoPanelOpen}
        title={t('video.toggle')}
      >
        <Film className="icon-xs" />
        {t('video.toggle')}
      </button>
    </div>
  );
}
